import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { WorkbenchModel } from '../web/workbench/model.ts';
import { RecordingController } from '../web/workbench/recorder.ts';
import { AudioTransport } from '../web/workbench/transport.ts';
import { decodePcmWav } from '../web/audio/pcmWav.ts';

async function setup(){
 const db=await openWorkbenchDatabase(new IDBFactory()),repo=new WorkbenchRepository(db);
 await repo.beginAsset({id:'a',source:'microphone',state:'recording',sampleRate:44100,channelCount:1,sampleCount:0,createdAt:1,markers:[]});
 await repo.appendChunk({assetId:'a',index:0,startSample:0,channels:[new Float32Array([.1,.2,.3,.4,.5])]});const kept=await repo.finalizeTake('a');
 const recorder=new RecordingController({repository:repo,capture:{start:async()=>({sampleRate:44100}),stop:async()=>{}},onChange:()=>{},stopPlayback:()=>{}});
 const transport=new AudioTransport({repository:repo,context:()=>{throw new Error('No playback in this test');},renderNotes:async()=>{throw new Error('No synthesis');},onChange:()=>{}});
 const model=new WorkbenchModel({repository:repo,recorder,transport});await model.refresh();await model.openIdea(kept.riffId);return {db,repo,model,kept};
}
test('audio-only Inbox selection survives subscriptions and keeps the full original asset',async()=>{
 const {db,repo,model}=await setup();assert.equal(model.snapshot.riffs.length,1);assert.equal(model.snapshot.version!.notes.length,0);
 model.setSelection(1,4);const unsubscribe=model.subscribe(()=>{});unsubscribe();assert.equal(model.snapshot.selection!.startSample,1);
 const kept=await model.keepSelection();const version=(await repo.getRiff(kept.riffId))!.versions[0]!;
 assert.deepEqual(version.recording,{assetId:'a',startSample:1,endSample:4});assert.equal((await repo.listAssets())[0]!.sampleCount,5);
 assert.equal((await repo.listAssets()).length,1);db.close();
});
test('zero-length draft selections cannot play, keep, or export',async()=>{
 const {db,model}=await setup();model.setSelection(2,2);assert.equal(model.canUseSelection,false);
 await assert.rejects(model.keepSelection());await assert.rejects(model.exportSelection());await assert.rejects(model.play());db.close();
});
test('range WAV export contains selected samples at the actual source rate',async()=>{
 const {db,model}=await setup();model.setSelection(1,4);const decoded=decodePcmWav(new Uint8Array(await (await model.exportSelection()).arrayBuffer()));
 assert.equal(decoded.sampleRate,44100);assert.equal(decoded.channels[0]!.length,3);assert.ok(Math.abs(decoded.channels[0]![0]!-.2)<.0001);db.close();
});
test('edits keep immutable take ranges; favorite undo leaves every pinned version available',async()=>{
 const {db,model,repo,kept}=await setup();
 const original=structuredClone(model.snapshot.version!);model.setSelection(1,3);
 await model.saveVersionEdit({...original,label:'Short passage',recording:model.snapshot.selection!});
 const edited=model.snapshot.version!;assert.notEqual(edited.id,original.id);assert.equal(edited.parentId,original.id);
 await model.undo();assert.equal(model.snapshot.riff!.currentVersionId,original.id);
 const stored=(await repo.getRiff(kept.riffId))!;assert.deepEqual(stored.versions.find(v=>v.id===edited.id)!.recording,{assetId:'a',startSample:1,endSample:3});
 assert.deepEqual(stored.versions.find(v=>v.id===original.id)!.recording,original.recording);
 await model.redo();assert.equal(model.snapshot.version!.id,edited.id);db.close();
});
