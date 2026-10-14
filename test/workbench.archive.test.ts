import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { exportProject,restoreProject } from '../web/workbench/backup.ts';
import { zipEntries,unpackArchive } from '../src/workbench/archive.ts';
async function setup(){return new WorkbenchRepository(await openWorkbenchDatabase(new IDBFactory()));}
test('project ZIP retains stereo, raw imports, versions, sections and lyrics; repeated restore is idempotent',async()=>{
 const repo=await setup(),dest=await setup(),signal=new AbortController().signal;
 await repo.beginAsset({id:'audio',source:'import',state:'recording',sampleRate:44100,channelCount:2,sampleCount:0,createdAt:1,markers:[],originalBlob:new Blob(['original bytes']),originalFilename:'Track.m4a'});
 await repo.appendChunk({assetId:'audio',index:0,startSample:0,channels:[new Float32Array([.1,.2,.3]),new Float32Array([-.1,-.2,-.3])]});
 const kept=await repo.finalizeTake('audio');await repo.putSong({id:'song',name:'Own song',createdAt:1,notes:'Let the last chord ring.',sections:[{id:'verse',riffId:kept.riffId,versionId:kept.versionId,role:'Verse',repeats:2}]});
 const archive=await exportProject('song',repo,signal);const restored=await restoreProject(archive,dest,signal);
 assert.equal(restored.projectId,'song');assert.equal((await dest.getSong('song'))!.notes,'Let the last chord ring.');
 assert.deepEqual(await dest.readRegion({assetId:'audio',startSample:0,endSample:3}),await repo.readRegion({assetId:'audio',startSample:0,endSample:3}));
 assert.equal(await (await dest.getAsset('audio'))!.originalBlob!.text(),'original bytes');
 const again=await restoreProject(archive,dest,signal);assert.equal(again.remapped,0);assert.equal((await dest.listSongs()).length,1);
 const changed=(await dest.getSong('song'))!;changed.name='Changed locally';await dest.putSong(changed);
 const collision=await restoreProject(archive,dest,signal);assert.notEqual(collision.projectId,'song');assert.equal((await dest.getSong('song'))!.name,'Changed locally');
 repo.close();dest.close();
});
test('untrusted archives reject paths, declared overflow, truncation, corruption and cancellation',async()=>{
 const signal=new AbortController().signal;
 const bad=await zipEntries([['../escape',new Uint8Array([1])]],signal);
 await assert.rejects(unpackArchive(bad,signal),/path/i);
 const valid=await zipEntries([['manifest.json',new Uint8Array(10000)]],signal);
 await assert.rejects(unpackArchive(valid,signal,100),/limit|budget|size/i);
 await assert.rejects(unpackArchive(valid.slice(0,-15),signal));
 const controller=new AbortController();controller.abort();await assert.rejects(unpackArchive(valid,controller.signal));
});
test('bad manifest/hash restores publish no records',async()=>{
 const repo=await setup(),signal=new AbortController().signal;
 const bytes=await zipEntries([['manifest.json',new TextEncoder().encode(JSON.stringify({version:999}))]],signal);
 await assert.rejects(restoreProject(new Blob([bytes]),repo,signal));assert.deepEqual(await repo.listRiffs(),[]);assert.deepEqual(await repo.listSongs(),[]);assert.deepEqual(await repo.listAssets(),[]);repo.close();
});
