import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase, inTransaction, requestValue } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { migrateLegacy } from '../web/workbench/migration.ts';
import { DEFAULT_STORAGE_KEY } from '../src/library/localStorageStore.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { riffFixture, songFixture } from './fixtures/workbench.ts';

async function fixture(){
 const db=await openWorkbenchDatabase(new IDBFactory()), repo=new WorkbenchRepository(db),riff=riffFixture(),song=songFixture(riff);
 riff.versions[0]!.audioRef='clip:original';delete song.sections[0]!.versionId;song.sections[0]!.role='Guitar stops';
 const items=new Map([[DEFAULT_STORAGE_KEY,JSON.stringify({version:1,riffs:[riff],songs:[song]})]]);
 const storage={getItem:(key:string)=>items.get(key)??null,setItem:(key:string,value:string)=>{items.set(key,value);},removeItem:(key:string)=>{items.delete(key);}};
 await inTransaction(db,['clips'],'readwrite',async tx=>{await requestValue(tx.objectStore('clips').put({id:'original',samples:new Float32Array([.25,-.5]),sampleRate:44100,savedAt:7}));});
 return {db,repo,riff,song,items,storage};
}
test('migration preserves ids, original bytes, custom roles and the legacy recovery copy',async()=>{
 const {db,repo,storage,items}=await fixture(),before=items.get(DEFAULT_STORAGE_KEY);
 assert.equal((await migrateLegacy(db,storage)).migrated,1);
 const riff=(await repo.getRiff('riff-1'))!,song=(await repo.listSongs())[0]!;
 assert.equal(riff.versions[0]!.id,'v-1');assert.equal(song.sections[0]!.versionId,'v-1');assert.equal(song.sections[0]!.role,'Guitar stops');
 assert.deepEqual([...(await repo.readRegion(riff.versions[0]!.recording!)).channels[0]!],[.25,-.5]);
 assert.equal(items.get(DEFAULT_STORAGE_KEY),before);assert.equal((await migrateLegacy(db,storage)).migrated,0);assert.equal((await repo.listRiffs()).length,1);db.close();
});
test('missing clips and invalid entries are reported without losing valid music',async()=>{
 const {db,repo,storage,items,riff}=await fixture();riff.versions[0]!.audioRef='clip:absent';
 items.set(DEFAULT_STORAGE_KEY,JSON.stringify({riffs:[riff,{id:'broken'}],songs:[]}));
 const report=await migrateLegacy(db,storage);assert.equal(report.missingAudio.length,1);assert.equal(report.rejected.length,1);
 assert.equal((await repo.getRiff('riff-1'))!.versions[0]!.recording,undefined);
 items.set(DEFAULT_STORAGE_KEY,'{broken');assert.equal((await migrateLegacy(db,storage)).rejected.length,1);assert.equal((await repo.listRiffs()).length,1);db.close();
});
test('legacy drift recovers a copy and never overwrites newer workbench edits',async()=>{
 const {db,repo,storage,items,riff}=await fixture();await migrateLegacy(db,storage);
 const current=(await repo.getRiff('riff-1'))!;current.name='Workbench edit';await repo.putRiff(current);
 riff.name='Old tab edit';items.set(DEFAULT_STORAGE_KEY,JSON.stringify({riffs:[riff],songs:[]}));
 assert.equal((await migrateLegacy(db,storage)).recoveredLegacyChanges,1);
 assert.equal((await repo.getRiff('riff-1'))!.name,'Workbench edit');
 const copy=(await repo.listRiffs()).find(r=>r.id!=='riff-1')!;assert.equal(copy.name,'Old tab edit');assert.notEqual(copy.versions[0]!.id,'v-1');
 assert.equal((await migrateLegacy(db,storage)).recoveredLegacyChanges,0);db.close();
});
test('audio-only ideas are not quality-ranked or falsely recognized',async()=>{
 const {db,repo}=await fixture();await repo.beginAsset({id:'a',source:'microphone',state:'recording',sampleRate:44100,channelCount:1,sampleCount:0,createdAt:1,markers:[]});
 await repo.appendChunk({assetId:'a',index:0,startSample:0,channels:[new Float32Array([.1])]});const kept=await repo.finalizeTake('a');
 const library=new RiffLibrary(repo);assert.equal((await library.bestTake(kept.riffId)).id,kept.versionId);assert.deepEqual(await library.findSimilar([]),[]);db.close();
});
