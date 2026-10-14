import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase, transactionDone } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { riffFixture } from './fixtures/workbench.ts';
import type { AudioAsset } from '../src/workbench/types.ts';

const asset = (id='a'):AudioAsset => ({id,source:'microphone',state:'recording',sampleRate:44100,channelCount:1,sampleCount:0,createdAt:1,markers:[]});
async function setup(){const db=await openWorkbenchDatabase(new IDBFactory());return {db,repo:new WorkbenchRepository(db)};}
async function captured(repo:WorkbenchRepository,id='a'){await repo.beginAsset(asset(id));await repo.appendChunk({assetId:id,index:0,startSample:0,channels:[new Float32Array([.25,-.5,.75])]});}

test('no-note recording commits and reopens with exact samples',async()=>{
  const {db,repo}=await setup();await captured(repo);const kept=await repo.finalizeTake('a');
  const fresh=new WorkbenchRepository(db);const riff=(await fresh.getRiff(kept.riffId))!;
  assert.equal(riff.versions[0]!.notes.length,0);
  assert.deepEqual([...(await fresh.readRegion(riff.versions[0]!.recording!)).channels[0]!],[.25,-.5,.75]);
  const library=new RiffLibrary(repo);const saved=await library.saveRiff([],{recording:riff.versions[0]!.recording});
  assert.ok(await repo.getRiff(saved.id));
  await assert.rejects(new RiffLibrary().saveRiff([],{recording:riff.versions[0]!.recording}));db.close();
});
test('unfinished and dangling audio cannot be published',async()=>{
  const {db,repo}=await setup();await captured(repo);
  await assert.rejects(repo.assertRecording({assetId:'a',startSample:0,endSample:2}));
  await assert.rejects(repo.assertRecording({assetId:'missing',startSample:0,endSample:2}));
  const riff=riffFixture();riff.versions[0]!.recording={assetId:'missing',startSample:0,endSample:2};
  await assert.rejects(repo.putRiff(riff));assert.equal(await repo.getRiff(riff.id),null);db.close();
});
test('request success followed by abort never resolves as saved',async()=>{
  const {db}=await setup();const tx=db.transaction('meta','readwrite');const done=transactionDone(tx);
  const request=tx.objectStore('meta').put({id:'will-abort'});request.onsuccess=()=>tx.abort();
  await assert.rejects(done,/abort/i);const check=db.transaction('meta');const found=check.objectStore('meta').get('will-abort');
  assert.equal(await new Promise(resolve=>found.onsuccess=()=>resolve(found.result)),undefined);db.close();
});
test('append rejects duplicate or out-of-order chunks without changing durable length',async()=>{
  const {db,repo}=await setup();await captured(repo);
  await assert.rejects(repo.appendChunk({assetId:'a',index:0,startSample:0,channels:[new Float32Array([1])]}));
  await assert.rejects(repo.appendChunk({assetId:'a',index:2,startSample:3,channels:[new Float32Array([1])]}));
  assert.equal((await repo.getAsset('a'))!.sampleCount,3);db.close();
});
test('failed finalization preserves incomplete source for recovery',async()=>{
  const {db,repo}=await setup();await captured(repo);
  await assert.rejects(repo.finalizeTake('a',{riffId:'missing',parentId:'missing'}));
  assert.equal((await repo.getAsset('a'))!.state,'recording');assert.equal((await repo.listRiffs()).length,0);db.close();
});
test('recovery is idempotent and empty captures do not become ideas',async()=>{
  const {db,repo}=await setup();await captured(repo);await repo.beginAsset(asset('empty'));
  const first=await repo.recoverInterrupted();assert.equal(first.length,1);assert.deepEqual(await repo.recoverInterrupted(),[]);
  assert.equal((await repo.getRiff(first[0]!.riffId))!.versions[0]!.label,'Interrupted take');db.close();
});
test('stale revisions cannot erase a concurrent edit and archiving preserves audio',async()=>{
  const {db,repo}=await setup();await captured(repo);const kept=await repo.finalizeTake('a');
  const a=(await repo.getRiff(kept.riffId))!,b=structuredClone(a);a.name='First';b.name='Stale';
  await repo.putRiff(a);await assert.rejects(repo.putRiff(b),/changed in another/i);
  assert.equal((await repo.getRiff(kept.riffId))!.name,'First');
  await repo.archiveRiff(kept.riffId,true);assert.equal((await repo.listAssets()).length,1);
  await repo.archiveRiff(kept.riffId,false);assert.equal((await repo.getRiff(kept.riffId))!.archivedAt,undefined);db.close();
});
