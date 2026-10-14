import type { Riff, RiffVersion, SongSeed } from '../../src/types.ts';
import type { RiffStore } from '../../src/library/store.ts';
import type { AudioAsset, AudioChunk, AudioRegion, KeptTake, PcmAudio, TakeTarget } from '../../src/workbench/types.ts';
import { validatePcm, validateRegion } from '../../src/workbench/regions.ts';
import { makeId } from '../../src/util/id.ts';
import { inTransaction, requestValue } from './database.ts';

export class ConflictError extends Error {
  constructor(){super('This idea changed in another tab. Reload it before retrying your edit.');this.name='ConflictError';}
}
export interface RestoreBundle {
 riffs:Riff[];song:SongSeed;assets:Array<{asset:AudioAsset;chunks:AudioChunk[]}>;
 expected:Array<{store:'riffs'|'songs'|'assets';id:string;value:string|null}>;
}

export class WorkbenchRepository implements RiffStore {
  readonly db: IDBDatabase;
  private closed=false;
  constructor(db:IDBDatabase){this.db=db;db.addEventListener('versionchange',()=>{this.closed=true;db.close();});}
  close():void{this.closed=true;this.db.close();}
  private run<T>(stores:string[],mode:IDBTransactionMode,fn:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    if(this.closed)return Promise.reject(new Error('Music storage was updated in another tab. Reload before saving.'));
    return inTransaction(this.db,stores,mode,fn);
  }
  private async all<T>(name:string):Promise<T[]>{return this.run([name],'readonly',tx=>requestValue(tx.objectStore(name).getAll()));}
  private async get<T>(name:string,id:string):Promise<T|null>{return this.run([name],'readonly',async tx=>(await requestValue(tx.objectStore(name).get(id)))??null);}
  listRiffs():Promise<Riff[]>{return this.all('riffs');}
  getRiff(id:string):Promise<Riff|null>{return this.get('riffs',id);}
  listSongs():Promise<SongSeed[]>{return this.all('songs');}
  getSong(id:string):Promise<SongSeed|null>{return this.get('songs',id);}
  getAsset(id:string):Promise<AudioAsset|null>{return this.get('assets',id);}
  listAssets():Promise<AudioAsset[]>{return this.all('assets');}

  private async checkRecording(tx:IDBTransaction,region:AudioRegion):Promise<void>{
    const asset:AudioAsset|undefined=await requestValue(tx.objectStore('assets').get(region.assetId));
    if(!asset || asset.state==='recording')throw new Error('Recording is missing or has not finished saving');
    validateRegion(region,asset.sampleCount);
  }
  async assertRecording(region:AudioRegion):Promise<void>{await this.run(['assets'],'readonly',tx=>this.checkRecording(tx,region));}

  async putRiff(riff:Riff):Promise<void>{
    const copy=structuredClone(riff);
    const revision=await this.run(['riffs','assets'],'readwrite',async tx=>{
      const store=tx.objectStore('riffs'), old:Riff|undefined=await requestValue(store.get(copy.id));
      if((old?.revision??0)!==(copy.revision??0))throw new ConflictError();
      if(!copy.versions.some(v=>v.id===copy.currentVersionId))throw new Error('Idea has no selected version');
      for(const v of copy.versions){
        if(v.recording)await this.checkRecording(tx,v.recording);
        else if(!v.notes.length && v.sourceKind!=='legacy')throw new Error('A version needs notes or a saved recording');
      }
      copy.revision=(old?.revision??0)+1;await requestValue(store.put(copy));return copy.revision;
    });
    riff.revision=revision;
  }
  async putSong(song:SongSeed):Promise<void>{
    const copy=structuredClone(song);
    const revision=await this.run(['songs','riffs','assets'],'readwrite',async tx=>{
      const store=tx.objectStore('songs'),old:SongSeed|undefined=await requestValue(store.get(copy.id));
      if((old?.revision??0)!==(copy.revision??0))throw new ConflictError();
      for(const section of copy.sections){
        const riff:Riff|undefined=await requestValue(tx.objectStore('riffs').get(section.riffId));
        const version=riff?.versions.find(v=>v.id===(section.versionId??riff.currentVersionId));
        if(!version)throw new Error('A song section refers to an unavailable take.');
        section.id??=makeId('section');section.versionId=version.id;section.repeats??=1;
        if(!Number.isInteger(section.repeats)||section.repeats<1||section.repeats>32)throw new Error('Section repeats must be between 1 and 32.');
        if(!section.recording&&version.recording)section.recording={...version.recording};
        if(section.recording){if(section.recording.assetId!==version.recording?.assetId)throw new Error('Section audio must belong to the pinned take');await this.checkRecording(tx,section.recording);}
      }
      copy.revision=(old?.revision??0)+1;await requestValue(store.put(copy));return copy.revision;
    });song.revision=revision;
  }
  async archiveRiff(id:string,archived:boolean):Promise<void>{
    const riff=await this.getRiff(id);if(!riff)throw new Error('Idea not found');
    if(archived)riff.archivedAt=Date.now();else delete riff.archivedAt;
    await this.putRiff(riff);
  }
  async deleteRiff(id:string):Promise<void>{await this.archiveRiff(id,true);}
  async deleteSong(id:string):Promise<void>{const song=await this.getSong(id);if(song){song.archivedAt=Date.now();await this.putSong(song);}}

  async beginAsset(asset:AudioAsset):Promise<void>{
    if(!asset.id || asset.state!=='recording' || asset.sampleCount!==0 || ![1,2].includes(asset.channelCount)
      || !Number.isSafeInteger(asset.sampleRate) || asset.sampleRate<=0)throw new Error('Invalid new recording');
    await this.run(['assets'],'readwrite',async tx=>{await requestValue(tx.objectStore('assets').add(structuredClone(asset)));});
  }
  async appendChunk(chunk:AudioChunk):Promise<void>{
    const copy=structuredClone(chunk);
    await this.run(['assets','chunks'],'readwrite',async tx=>{
      const assets=tx.objectStore('assets'), chunks=tx.objectStore('chunks');
      const asset:AudioAsset|undefined=await requestValue(assets.get(copy.assetId));
      if(!asset || asset.state!=='recording')throw new Error('Recording is not open');
      validatePcm({sampleRate:asset.sampleRate,channels:copy.channels});
      const count=await requestValue(chunks.index('assetId').count(asset.id));
      if(copy.index!==count || copy.startSample!==asset.sampleCount || copy.channels.length!==asset.channelCount)throw new Error('Out-of-order recording chunk');
      await requestValue(chunks.add(copy));
      asset.sampleCount+=copy.channels[0]!.length;await requestValue(assets.put(asset));
    });
  }
  async setMarkers(id:string,markers:number[]):Promise<void>{
    await this.run(['assets'],'readwrite',async tx=>{
      const store=tx.objectStore('assets'), asset:AudioAsset|undefined=await requestValue(store.get(id));
      if(!asset)throw new Error('Recording not found');
      asset.markers=markers.filter(n=>Number.isSafeInteger(n)&&n>=0&&n<asset.sampleCount);
      await requestValue(store.put(asset));
    });
  }
  async readRegion(region:AudioRegion):Promise<PcmAudio>{
    return this.run(['assets','chunks'],'readonly',async tx=>{
      const asset:AudioAsset|undefined=await requestValue(tx.objectStore('assets').get(region.assetId));
      if(!asset)throw new Error('Recording unavailable');validateRegion(region,asset.sampleCount);
      const chunks:AudioChunk[]=await requestValue(tx.objectStore('chunks').index('assetId').getAll(asset.id));
      chunks.sort((a,b)=>a.index-b.index);
      const channels=Array.from({length:asset.channelCount},()=>new Float32Array(region.endSample-region.startSample));
      let expected=0;
      for(const chunk of chunks){
        if(chunk.startSample!==expected || chunk.channels.length!==channels.length)throw new Error('Recording has a missing chunk');
        const length=chunk.channels[0]!.length;expected+=length;
        const from=Math.max(region.startSample,chunk.startSample),to=Math.min(region.endSample,expected);
        if(to>from)channels.forEach((c,i)=>c.set(chunk.channels[i]!.subarray(from-chunk.startSample,to-chunk.startSample),from-region.startSample));
      }
      if(expected!==asset.sampleCount)throw new Error('Recording is incomplete');
      return {sampleRate:asset.sampleRate,channels};
    });
  }
  async finalizeTake(assetId:string,target?:TakeTarget):Promise<KeptTake>{return this.finish(assetId,target,false);}
  async finalizeInterrupted(assetId:string,target?:TakeTarget):Promise<KeptTake>{return this.finish(assetId,target,true);}
  private async finish(assetId:string,target:TakeTarget,interrupted:boolean):Promise<KeptTake>{
    return this.run(['assets','riffs','meta'],'readwrite',async tx=>{
      const assets=tx.objectStore('assets'),riffs=tx.objectStore('riffs'),meta=tx.objectStore('meta');
      const saved=await requestValue(meta.get(`take:${assetId}`));if(saved)return saved.value as KeptTake;
      const asset:AudioAsset|undefined=await requestValue(assets.get(assetId));
      if(!asset || !asset.sampleCount)throw new Error('There are no recorded samples to save');
      let riff:Riff|undefined=target?await requestValue(riffs.get(target.riffId)):undefined;
      if(target && (!riff || !riff.versions.some(v=>v.id===target.parentId)))throw new Error('The parent take is no longer available');
      const version:RiffVersion={id:makeId('ver'),label:interrupted?'Interrupted take':`Take ${(riff?.versions.length??0)+1}`,parentId:target?.parentId??null,
        notes:[],createdAt:asset.createdAt,recording:{assetId,startSample:0,endSample:asset.sampleCount},
        sourceKind:asset.source==='import'?'imported':asset.source==='legacy'?'legacy':'recorded',analysis:{state:'unavailable'}};
      if(target)version.provenance={sourceVersionId:target.parentId,operation:'performance',parameters:{}};
      riff=riff??{id:makeId('riff'),name:null,createdAt:asset.createdAt,updatedAt:Date.now(),versions:[],currentVersionId:version.id,tags:[]};
      riff.versions.push(version);riff.currentVersionId=version.id;riff.updatedAt=Date.now();riff.revision=(riff.revision??0)+1;
      asset.state=interrupted?'interrupted':'complete';
      const kept={riffId:riff.id,versionId:version.id};
      await requestValue(assets.put(asset));await requestValue(riffs.put(riff));await requestValue(meta.put({id:`take:${assetId}`,value:kept}));return kept;
    });
  }
  async recoverInterrupted():Promise<KeptTake[]>{
    const recovered:KeptTake[]=[];
    for(const asset of await this.listAssets())if(asset.source==='microphone' && asset.state==='recording' && asset.sampleCount>0){
      await this.readRegion({assetId:asset.id,startSample:0,endSample:asset.sampleCount});
      recovered.push(await this.finish(asset.id,undefined,true));
    }
    return recovered;
  }
  async abandonAsset(id:string):Promise<void>{
    await this.run(['assets','chunks'],'readwrite',async tx=>{
      const assets=tx.objectStore('assets'),asset:AudioAsset|undefined=await requestValue(assets.get(id));
      if(!asset || asset.state!=='recording')return;
      const chunks=tx.objectStore('chunks'),keys=await requestValue(chunks.index('assetId').getAllKeys(id));
      for(const key of keys)await requestValue(chunks.delete(key));await requestValue(assets.delete(id));
    });
  }
  async beginRestore(id:string):Promise<void>{await this.run(['staging'],'readwrite',async tx=>{await requestValue(tx.objectStore('staging').add({id,session:id,state:'active',heartbeat:Date.now()}));});}
  async stageRestoreEntry(id:string,path:string,bytes:Uint8Array):Promise<void>{
    await this.run(['staging'],'readwrite',async tx=>{const store=tx.objectStore('staging');const session=await requestValue(store.get(id));if(session?.state!=='active')throw new Error('Restore session closed');await requestValue(store.add({id:`${id}:${path}`,session:id,path,bytes}));session.heartbeat=Date.now();await requestValue(store.put(session));});
  }
  async discardRestore(id:string):Promise<void>{await this.run(['staging'],'readwrite',async tx=>{const store=tx.objectStore('staging');for(const entry of await requestValue(store.getAll()))if(entry.session===id)await requestValue(store.delete(entry.id));});}
  async commitRestore(id:string,bundle:RestoreBundle):Promise<void>{
    await this.run(['staging','riffs','songs','assets','chunks'],'readwrite',async tx=>{
      if((await requestValue(tx.objectStore('staging').get(id)))?.state!=='active')throw new Error('Restore session unavailable');
      for(const expected of bundle.expected){const actual=await requestValue(tx.objectStore(expected.store).get(expected.id));if((actual?JSON.stringify(actual):null)!==expected.value)throw new ConflictError();}
      for(const {asset,chunks} of bundle.assets){await requestValue(tx.objectStore('assets').add(asset));for(const chunk of chunks)await requestValue(tx.objectStore('chunks').add(chunk));}
      for(const riff of bundle.riffs)await requestValue(tx.objectStore('riffs').add({...riff,revision:1}));
      const existing=await requestValue(tx.objectStore('songs').get(bundle.song.id));if(!existing)await requestValue(tx.objectStore('songs').add({...bundle.song,revision:1}));
      const store=tx.objectStore('staging');for(const entry of await requestValue(store.getAll()))if(entry.session===id)await requestValue(store.delete(entry.id));
    });
  }
}
