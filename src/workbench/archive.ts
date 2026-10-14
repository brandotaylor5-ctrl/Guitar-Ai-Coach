import { Zip,ZipDeflate,Unzip,UnzipInflate } from 'fflate';
import type { Riff,SongSeed } from '../types.ts';
import type { AudioAsset,AudioRegion } from './types.ts';
import { MAX_ARCHIVE_BYTES } from './types.ts';
import { validateRegion } from './regions.ts';
export interface ArchiveAudio extends Omit<AudioAsset,'originalBlob'> {path:string;sha256:string;originalFilePath?:string;originalSha256?:string}
export interface ProjectManifest {version:1;project:SongSeed;riffs:Riff[];audio:ArchiveAudio[];missingAudio:string[]}
export type ArchiveEntries=Array<[string,Uint8Array<ArrayBuffer>]>;
export function validPath(path:string):boolean{return !!path&&path.length<500&&!path.startsWith('/')&&!/[\\\0:]/.test(path)&&path.split('/').every(p=>!!p&&p!=='.'&&p!=='..');}
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200;
export function validateManifest(value:unknown):ProjectManifest{
 const m=value as ProjectManifest;
 if(!m||m.version!==1||!m.project||!id(m.project.id)||typeof m.project.name!=='string'||!Array.isArray(m.project.sections)||!Array.isArray(m.riffs)||!Array.isArray(m.audio)||!Array.isArray(m.missingAudio)||!m.missingAudio.every(id))throw new Error('Unsupported or invalid project manifest.');
 const unique=(values:string[])=>new Set(values).size===values.length;
 if(!unique(m.missingAudio)||!unique(m.riffs.map(r=>r.id))||!unique(m.audio.map(a=>a.id)))throw new Error('Duplicate project IDs.');
 const paths=['manifest.json','notes.txt'];let expanded=0;const versionIds:string[]=[];
 for(const a of m.audio){
  if(!id(a.id)||!validPath(a.path)||! /^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.sampleCount)||a.sampleCount<1||!Number.isSafeInteger(a.sampleRate)||a.sampleRate<8000||a.sampleRate>192000||a.sampleCount>a.sampleRate*600||![1,2].includes(a.channelCount)||!Array.isArray(a.markers)||!a.markers.every(n=>Number.isInteger(n)&&n>=0&&n<a.sampleCount))throw new Error('Invalid audio manifest entry.');
  expanded+=a.sampleCount*a.channelCount*4+44;paths.push(a.path);
  if(a.originalFilePath){if(!validPath(a.originalFilePath)||! /^[a-f0-9]{64}$/.test(a.originalSha256??''))throw new Error('Invalid original file entry');paths.push(a.originalFilePath);}
 }
 if(!unique(paths)||expanded>MAX_ARCHIVE_BYTES)throw new Error('Duplicate paths or expanded audio budget exceeded.');
 function region(region:AudioRegion):void{
  const asset=m.audio.find(a=>a.id===region.assetId);
  if(asset)validateRegion(region,asset.sampleCount);else if(!m.missingAudio.includes(region.assetId))throw new Error('A recording reference is missing from the archive.');
 }
 for(const r of m.riffs){
  if(!id(r.id)||!Array.isArray(r.versions)||!r.versions.length||!r.versions.some(v=>v.id===r.currentVersionId)||!Array.isArray(r.tags)||!r.tags.every(t=>typeof t==='string')||r.name!==null&&typeof r.name!=='string')throw new Error('Invalid idea entry');
  for(const v of r.versions){
   if(!id(v.id)||typeof v.label!=='string'||!Array.isArray(v.notes)||v.notes.length>10000||!v.notes.every(n=>Number.isInteger(n.midi)&&n.midi>=0&&n.midi<=127&&Number.isFinite(n.startMs)&&n.startMs>=0&&Number.isFinite(n.durationMs)&&n.durationMs>0&&n.startMs+n.durationMs<=600000&&Number.isFinite(n.confidence)&&n.confidence>=0&&n.confidence<=1))throw new Error('Invalid take or notes');
   if(v.parentId!==null&&!r.versions.some(p=>p.id===v.parentId))throw new Error('Missing parent take');
   if(v.provenance&&!r.versions.some(p=>p.id===v.provenance!.sourceVersionId))throw new Error('Missing provenance take');
   if(v.recording)region(v.recording);versionIds.push(v.id);
  }
 }
 if(!unique(versionIds))throw new Error('Duplicate version IDs');
 for(const s of m.project.sections){
  const v=m.riffs.find(r=>r.id===s.riffId)?.versions.find(v=>v.id===s.versionId);
  if(!v||typeof s.role!=='string'||!Number.isInteger(s.repeats??1)||(s.repeats??1)<1||(s.repeats??1)>32)throw new Error('Invalid pinned song section');
  if(s.recording){if(s.recording.assetId!==v.recording?.assetId)throw new Error('Section source mismatch');region(s.recording);}
 }
 return structuredClone(m);
}
function concat(chunks:Uint8Array[],length:number):Uint8Array<ArrayBuffer>{const result=new Uint8Array(length);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;}
export async function zipEntries(entries:ArchiveEntries,signal:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
 signal.throwIfAborted();const chunks:Uint8Array[]=[];let size=0,error:Error|null=null;
 const zip=new Zip((err,data)=>{if(err){error=err;return;}size+=data.length;if(size>MAX_ARCHIVE_BYTES){error=new Error('Archive exceeds the size limit');return;}chunks.push(data);});
 try{
  for(const [path,bytes] of entries){const file=new ZipDeflate(path,{level:1});zip.add(file);for(let at=0;at<bytes.length||at===0;at+=65536){signal.throwIfAborted();if(error)throw error;file.push(bytes.subarray(at,at+65536),at+65536>=bytes.length);await new Promise<void>(r=>setTimeout(r,0));}}
  zip.end();if(error)throw error;return concat(chunks,size);
 }catch(e){zip.terminate();throw e;}
}
/** Read central directory before inflation. No encryption, ZIP64, multidisk, duplicate paths, or unbounded output. */
export async function unpackArchive(bytes:Uint8Array<ArrayBuffer>,signal:AbortSignal,limit=MAX_ARCHIVE_BYTES):Promise<ArchiveEntries>{
 signal.throwIfAborted();if(bytes.length>MAX_ARCHIVE_BYTES||bytes.length<22)throw new Error('Invalid archive size');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){eocd=i;break;}
 if(eocd<0||view.getUint16(eocd+4,true)||view.getUint16(eocd+6,true))throw new Error('Truncated or unsupported archive');
 const count=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true),directorySize=view.getUint32(eocd+12,true);
 if(count>10000||directory+directorySize!==eocd)throw new Error('Invalid archive directory');
 const declared=new Map<string,number>();let at=directory,total=0;
 for(let i=0;i<count;i++){
  if(at+46>eocd||view.getUint32(at,true)!==0x02014b50)throw new Error('Invalid ZIP entry');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),size=view.getUint32(at+24,true),compressed=view.getUint32(at+20,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
  if(flags&65||![0,8].includes(method)||size===0xffffffff||compressed===0xffffffff)throw new Error('Encrypted or unsupported ZIP entry');
  if(at+46+nameLength+extra+comment>eocd||local+30>directory||view.getUint32(local,true)!==0x04034b50)throw new Error('Invalid ZIP offsets');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+nameLength));
  if(!validPath(name)||declared.has(name))throw new Error('Unsafe or duplicate archive path');
  const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
  if(view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method||new TextDecoder().decode(bytes.subarray(local+30,local+30+localName))!==name||local+30+localName+localExtra+compressed>directory)throw new Error('Mismatched ZIP header');
  total+=size;if(total>limit||name==='manifest.json'&&size>5000000)throw new Error('Expanded archive size exceeds the limit');
  declared.set(name,size);at+=46+nameLength+extra+comment;
 }
 if(at!==eocd)throw new Error('Invalid directory length');
 const entries:ArchiveEntries=[],seen=new Set<string>();let actual=0,failure:Error|null=null;
 const unzip=new Unzip(file=>{
  if(!declared.has(file.name)||seen.has(file.name)){failure=new Error('Unexpected or duplicate ZIP entry');return;}seen.add(file.name);
  const chunks:Uint8Array[]=[];let length=0;
  file.ondata=(error,data,final)=>{if(error){failure=error;return;}actual+=data.length;length+=data.length;
   if(actual>limit||length>declared.get(file.name)!){failure=new Error('Expanded output exceeds declared size or budget');file.terminate();return;}
   chunks.push(data);if(final){if(length!==declared.get(file.name))failure=new Error('False declared file length');else entries.push([file.name,concat(chunks,length)]);}
  };file.start();
 });unzip.register(UnzipInflate);
 for(let offset=0;offset<bytes.length;offset+=1024){signal.throwIfAborted();unzip.push(bytes.subarray(offset,offset+1024),offset+1024>=bytes.length);if(failure)throw failure;if(offset%65536===0)await new Promise<void>(r=>setTimeout(r,0));}
 if(entries.length!==count)throw new Error('Incomplete archive entries');return entries;
}
