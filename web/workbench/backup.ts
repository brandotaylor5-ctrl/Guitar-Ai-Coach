import type { Riff,SongSeed } from '../../src/types.ts';
import type { AudioAsset,AudioRegion,AudioChunk } from '../../src/workbench/types.ts';
import { MAX_ARCHIVE_BYTES } from '../../src/workbench/types.ts';
import { validateManifest,zipEntries,unpackArchive } from '../../src/workbench/archive.ts';
import type { ProjectManifest,ArchiveEntries,ArchiveAudio } from '../../src/workbench/archive.ts';
import { encodePcmWav,decodePcmWav } from '../audio/pcmWav.ts';
import { makeId } from '../../src/util/id.ts';
import type { WorkbenchRepository,RestoreBundle } from './repository.ts';
async function hash(bytes:Uint8Array<ArrayBuffer>):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function archiveWork<T>(op:'zip'|'unzip',payload:ArchiveEntries|Uint8Array<ArrayBuffer>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();
 if(typeof Worker==='undefined')return (op==='zip'?zipEntries(payload as ArchiveEntries,signal):unpackArchive(payload as Uint8Array<ArrayBuffer>,signal)) as Promise<T>;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./archive.worker.js',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
  worker.onerror=event=>{cleanup();reject(new Error(event.message||'Backup processing failed'));};worker.onmessage=event=>{cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);};worker.postMessage({op,payload});
 });
}
export async function exportProject(projectId:string,repo:WorkbenchRepository,signal:AbortSignal,acknowledgeMissing=false):Promise<Blob>{
 signal.throwIfAborted();const project=await repo.getSong(projectId);if(!project)throw new Error('Song unavailable');
 const riffs:Riff[]=[];for(const id of new Set(project.sections.map(s=>s.riffId))){const riff=await repo.getRiff(id);if(!riff)throw new Error('A song idea is missing');riffs.push(riff);}
 const assets=new Set(riffs.flatMap(r=>r.versions.flatMap(v=>v.recording?[v.recording.assetId]:[])));
 const entries:ArchiveEntries=[],audio:ArchiveAudio[]=[],missingAudio:string[]=[];let budget=0;
 const add=(path:string,bytes:Uint8Array<ArrayBuffer>)=>{budget+=bytes.length;if(budget>MAX_ARCHIVE_BYTES)throw new Error('Project exceeds the 500 MB backup budget');entries.push([path,bytes]);};
 for(const assetId of assets){
  signal.throwIfAborted();const asset=await repo.getAsset(assetId);if(!asset){missingAudio.push(assetId);continue;}
  if(asset.state==='recording')throw new Error('Finish recording before creating a backup');
  budget+=asset.sampleCount*asset.channelCount*4+44+(asset.originalBlob?.size??0);if(budget>MAX_ARCHIVE_BYTES)throw new Error('Project exceeds the 500 MB backup budget');budget-=asset.sampleCount*asset.channelCount*4+44+(asset.originalBlob?.size??0);
  const pcm=await repo.readRegion({assetId,startSample:0,endSample:asset.sampleCount}),bytes=new Uint8Array(encodePcmWav(pcm,'float32'));
  const {originalBlob,...metadata}=asset;const item:ArchiveAudio={...metadata,path:`audio/${audio.length}.wav`,sha256:await hash(bytes)};add(item.path,bytes);
  if(originalBlob){const raw=new Uint8Array(await originalBlob.arrayBuffer());item.originalFilePath=`originals/${audio.length}.bin`;item.originalSha256=await hash(raw);add(item.originalFilePath,raw);}audio.push(item);
 }
 for(const riff of riffs)for(const version of riff.versions)if(version.audioRef&&!version.recording)missingAudio.push(version.audioRef);
 if(missingAudio.length&&!acknowledgeMissing)throw new Error('Some legacy recordings are unavailable. Acknowledge the missing audio to export the remaining project.');
 const manifest:ProjectManifest={version:1,project,riffs,audio,missingAudio:[...new Set(missingAudio)]};validateManifest(manifest);
 const encoded=new TextEncoder().encode(JSON.stringify(manifest));if(encoded.length>5000000)throw new Error('Project manifest exceeds 5 MB');add('manifest.json',encoded);add('notes.txt',new TextEncoder().encode(`${project.name}\n\n${project.notes??''}\n\n${project.sections.map(s=>`${s.role} × ${s.repeats??1}`).join('\n')}`));
 return new Blob([await archiveWork<Uint8Array<ArrayBuffer>>('zip',entries,signal)],{type:'application/zip'});
}
function comparable(value:unknown):string{return JSON.stringify(value,(key,value)=>key==='revision'?undefined:value);}
export async function restoreProject(zip:Blob,repo:WorkbenchRepository,signal:AbortSignal):Promise<{projectId:string;skipped:number;remapped:number}>{
 signal.throwIfAborted();if(zip.size>MAX_ARCHIVE_BYTES)throw new Error('Backup exceeds the 500 MB input limit');
 const entries=await archiveWork<ArchiveEntries>('unzip',new Uint8Array(await zip.arrayBuffer()),signal),files=new Map(entries),raw=files.get('manifest.json');
 if(!raw||raw.length>5000000)throw new Error('Project manifest missing or too large');const manifest=validateManifest(JSON.parse(new TextDecoder().decode(raw)));
 const session=makeId('restore');await repo.beginRestore(session);
 try{
  for(const [path,bytes] of entries){signal.throwIfAborted();await repo.stageRestoreEntry(session,path,bytes);}
  const bundle:RestoreBundle={riffs:[],song:structuredClone(manifest.project),assets:[],expected:[]};let skipped=0,remapped=0;
  const assetMap=new Map<string,string>(),riffMap=new Map<string,string>(),versionMap=new Map<string,string>();
  const expect=(store:'riffs'|'songs'|'assets',id:string,value:unknown)=>bundle.expected.push({store,id,value:value?JSON.stringify(value):null});
  for(const entry of manifest.audio){
   signal.throwIfAborted();const bytes=files.get(entry.path);if(!bytes||await hash(bytes)!==entry.sha256)throw new Error('An audio file is missing or failed its checksum');
   const pcm=decodePcmWav(bytes);if(pcm.sampleRate!==entry.sampleRate||pcm.channels.length!==entry.channelCount||pcm.channels[0]!.length!==entry.sampleCount)throw new Error('Audio sample count or rate does not match the manifest');
   const raw=entry.originalFilePath?files.get(entry.originalFilePath):undefined;
   if(entry.originalFilePath&&(!raw||await hash(raw)!==entry.originalSha256))throw new Error('Original file checksum failed');
   const old=await repo.getAsset(entry.id);expect('assets',entry.id,old);let equal=false;
   if(old&&old.state!=='recording'&&old.sampleCount===entry.sampleCount&&old.channelCount===entry.channelCount&&old.sampleRate===entry.sampleRate){
    equal=await hash(new Uint8Array(encodePcmWav(await repo.readRegion({assetId:old.id,startSample:0,endSample:old.sampleCount}),'float32')))===entry.sha256;
    if(equal)equal=raw?!!old.originalBlob&&await hash(new Uint8Array(await old.originalBlob.arrayBuffer()))===entry.originalSha256:!old.originalBlob;
   }
   if(equal){assetMap.set(entry.id,entry.id);skipped++;continue;}
   const id=old?makeId('audio'):entry.id;assetMap.set(entry.id,id);if(old){remapped++;expect('assets',id,null);}
   const {path,sha256,originalFilePath,originalSha256,...metadata}=entry;const asset:AudioAsset={...metadata,id,state:entry.state==='interrupted'?'interrupted':'complete',...(raw?{originalBlob:new Blob([raw],{type:entry.originalMime??'application/octet-stream'})}:{})};
   const chunks:AudioChunk[]=[];for(let start=0;start<entry.sampleCount;start+=entry.sampleRate)chunks.push({assetId:id,index:chunks.length,startSample:start,channels:pcm.channels.map(c=>c.slice(start,start+entry.sampleRate))});bundle.assets.push({asset,chunks});
  }
  const region=(r:AudioRegion)=>({...r,assetId:assetMap.get(r.assetId)??r.assetId});
  for(const original of manifest.riffs){
   const riff=structuredClone(original);for(const v of riff.versions)if(v.recording)v.recording=region(v.recording);
   const old=await repo.getRiff(riff.id);expect('riffs',riff.id,old);
   if(old&&comparable(old)===comparable(riff)){riffMap.set(riff.id,riff.id);skipped++;continue;}
   if(old){const id=makeId('riff');riffMap.set(riff.id,id);riff.id=id;expect('riffs',id,null);remapped++;for(const v of riff.versions)versionMap.set(v.id,makeId('ver'));}else riffMap.set(riff.id,riff.id);
   bundle.riffs.push(riff);
  }
  for(const riff of bundle.riffs){riff.currentVersionId=versionMap.get(riff.currentVersionId)??riff.currentVersionId;for(const v of riff.versions){v.id=versionMap.get(v.id)??v.id;if(v.parentId)v.parentId=versionMap.get(v.parentId)??v.parentId;if(v.provenance)v.provenance.sourceVersionId=versionMap.get(v.provenance.sourceVersionId)??v.provenance.sourceVersionId;
    if(v.recording&&manifest.missingAudio.includes(v.recording.assetId)){delete v.recording;v.sourceKind='legacy';}delete v.audioRef;
   }}
  const song=bundle.song;for(const s of song.sections){s.riffId=riffMap.get(s.riffId)??s.riffId;s.versionId=versionMap.get(s.versionId!)??s.versionId;if(s.recording)s.recording=region(s.recording);if(s.recording&&manifest.missingAudio.includes(s.recording.assetId))delete s.recording;}
  const old=await repo.getSong(song.id);expect('songs',song.id,old);
  if(old&&comparable(old)!==comparable(song)){song.id=makeId('song');song.sections.forEach(s=>s.id=makeId('section'));remapped++;expect('songs',song.id,null);}else if(old)skipped++;
  signal.throwIfAborted();await repo.commitRestore(session,bundle);return {projectId:song.id,skipped,remapped};
 }catch(error){await repo.discardRestore(session).catch(()=>{});throw error;}
}
