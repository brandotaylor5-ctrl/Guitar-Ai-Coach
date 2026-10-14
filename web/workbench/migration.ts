import type { Riff, SongSeed } from '../../src/types.ts';
import { DEFAULT_STORAGE_KEY } from '../../src/library/localStorageStore.ts';
import type { StorageLike } from '../../src/library/localStorageStore.ts';
import type { AudioAsset, MigrationReport } from '../../src/workbench/types.ts';
import { validatePcm } from '../../src/workbench/regions.ts';
import { makeId } from '../../src/util/id.ts';
import type { StoredClip } from '../audio/clipStore.ts';
import { inTransaction, requestValue } from './database.ts';

interface MigrationMarker { id:string; raw:string; riffs:Record<string,string>; songs:Record<string,string> }
function validRiff(value:unknown):value is Riff {
  if(!value || typeof value!=='object')return false;
  const r=value as Riff;
  return typeof r.id==='string' && Array.isArray(r.versions) && r.versions.length>0
    && Number.isFinite(r.createdAt) && Array.isArray(r.tags) && r.versions.some(v=>v.id===r.currentVersionId)
    && r.versions.every(v=>typeof v.id==='string' && Array.isArray(v.notes) && v.notes.every(n=>Number.isFinite(n.midi)&&Number.isFinite(n.startMs)&&n.startMs>=0&&Number.isFinite(n.durationMs)&&n.durationMs>0));
}
function validSong(value:unknown):value is SongSeed {
  if(!value || typeof value!=='object')return false;
  const s=value as SongSeed;
  return typeof s.id==='string' && typeof s.name==='string' && Array.isArray(s.sections)
    && s.sections.every(section=>typeof section.riffId==='string'&&typeof section.role==='string');
}

export async function migrateLegacy(db:IDBDatabase,storage:StorageLike):Promise<MigrationReport>{
  const report:MigrationReport={migrated:0,missingAudio:[],rejected:[],recoveredLegacyChanges:0};
  const raw=storage.getItem(DEFAULT_STORAGE_KEY);if(!raw)return report;
  let parsed:{riffs?:unknown[];songs?:unknown[]};
  try {parsed=JSON.parse(raw);if(!parsed || !Array.isArray(parsed.riffs))throw new Error();}
  catch{return {...report,rejected:['The legacy library could not be read. Its original copy is still stored.']};}
  const riffs:Riff[]=[],songs:SongSeed[]=[];
  for(const value of parsed.riffs!) {if(validRiff(value))riffs.push(structuredClone(value));else report.rejected.push('An invalid legacy idea was left in the original library.');}
  for(const value of Array.isArray(parsed.songs)?parsed.songs:[]) {if(validSong(value))songs.push(structuredClone(value));else report.rejected.push('An invalid legacy song was left in the original library.');}
  return inTransaction(db,['meta','riffs','songs','assets','chunks','clips'],'readwrite',async tx=>{
    const meta=tx.objectStore('meta'), riffStore=tx.objectStore('riffs'), songStore=tx.objectStore('songs');
    const previous:MigrationMarker|undefined=await requestValue(meta.get('legacy-migration'));
    if(previous?.raw===raw)return {...report,migrated:0};
    const marker:MigrationMarker={id:'legacy-migration',raw,riffs:{},songs:{}};
    const remapped=new Map<string,string>(),versionIds=new Map<string,string>();
    for(const source of riffs){
      const originalId=source.id, fingerprint=JSON.stringify(source);marker.riffs[originalId]=fingerprint;
      if(previous?.riffs[originalId]===fingerprint)continue;
      const existing=await requestValue(riffStore.get(originalId));
      if(existing){
        source.id=makeId('recovered');remapped.set(originalId,source.id);report.recoveredLegacyChanges++;
        for(const v of source.versions)versionIds.set(v.id,makeId('ver'));
        source.currentVersionId=versionIds.get(source.currentVersionId)!;
        source.notes=[source.notes,'Recovered changes from an older app tab.'].filter(Boolean).join('\n');
      }
      source.revision=1;
      for(const version of source.versions){
        if(existing){version.id=versionIds.get(version.id)!;version.parentId=version.parentId?versionIds.get(version.parentId)??null:null;}
        delete version.recording;version.sourceKind='legacy';
        if(!version.audioRef)continue;
        const clip:StoredClip|undefined=await requestValue(tx.objectStore('clips').get(version.audioRef.replace(/^clip:/,'')));
        let usable=false;
        if(clip){try{validatePcm({sampleRate:clip.sampleRate,channels:[clip.samples]});usable=true;}catch{/* Report below; keep note data. */}}
        if(!usable || !clip){report.missingAudio.push(version.id);version.analysis={state:version.notes.length?'estimated':'unavailable',reason:'Recording unavailable'};continue;}
        const id=`legacy:${clip.id}:${clip.savedAt}`;
        if(!(await requestValue(tx.objectStore('assets').get(id)))){
          const asset:AudioAsset={id,source:'legacy',state:'complete',sampleRate:clip.sampleRate,channelCount:1,sampleCount:clip.samples.length,createdAt:clip.savedAt,markers:[]};
          await requestValue(tx.objectStore('assets').add(asset));
          await requestValue(tx.objectStore('chunks').add({assetId:id,index:0,startSample:0,channels:[clip.samples]}));
        }
        version.recording={assetId:id,startSample:0,endSample:clip.samples.length};
      }
      await requestValue(riffStore.add(source));report.migrated++;
    }
    for(const source of songs){
      const originalId=source.id,fingerprint=JSON.stringify(source);marker.songs[originalId]=fingerprint;
      const needsRemap=source.sections.some(s=>remapped.has(s.riffId));
      if(previous?.songs[originalId]===fingerprint && !needsRemap)continue;
      if(await requestValue(songStore.get(originalId)))source.id=makeId('recovered-song');
      source.revision=1;
      for(const section of source.sections){
        section.riffId=remapped.get(section.riffId)??section.riffId;
        const riff:Riff|undefined=await requestValue(riffStore.get(section.riffId));
        section.versionId=versionIds.get(section.versionId??'')??section.versionId??riff?.currentVersionId;
        section.id=section.id??makeId('section');section.repeats=section.repeats??1;
        const recording=riff?.versions.find(v=>v.id===section.versionId)?.recording;
        if(recording)section.recording={...recording};else delete section.recording;
      }
      await requestValue(songStore.add(source));
    }
    await requestValue(meta.put(marker));return report;
  });
}
