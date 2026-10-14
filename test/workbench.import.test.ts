import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { importAudio } from '../web/workbench/audioImport.ts';
import { encodePcmWav } from '../web/audio/pcmWav.ts';

test('stereo WAV imports retain native rate, original file bytes and no-note playback',async()=>{
 const db=await openWorkbenchDatabase(new IDBFactory()),repo=new WorkbenchRepository(db);
 const bytes=encodePcmWav({sampleRate:44100,channels:[new Float32Array([.25,-.5]),new Float32Array([.75,.1])]},'float32');
 const file=new File([bytes],'Burl.wav',{type:'audio/wav'});const kept=await importAudio(file,repo,new AbortController().signal);
 const version=(await repo.getRiff(kept.riffId))!.versions[0]!,asset=(await repo.getAsset(version.recording!.assetId))!;
 assert.equal(asset.sampleRate,44100);assert.equal(asset.channelCount,2);assert.equal(asset.originalFilename,'Burl.wav');
 assert.deepEqual(new Uint8Array(await asset.originalBlob!.arrayBuffer()),bytes);assert.equal(version.notes.length,0);db.close();
});
test('oversize, unsupported, cancelled and over-duration imports publish no ideas',async()=>{
 const db=await openWorkbenchDatabase(new IDBFactory()),repo=new WorkbenchRepository(db),abort=new AbortController();abort.abort();
 const bytes=encodePcmWav({sampleRate:10,channels:[new Float32Array(6001)]},'float32');
 const huge=new File(['x'],'huge.wav');Object.defineProperty(huge,'size',{value:100000001});
 await assert.rejects(importAudio(huge,repo,new AbortController().signal),/100 MB/);
 await assert.rejects(importAudio(new File(['bad'],'bad.txt'),repo,new AbortController().signal),/decode|format/i);
 await assert.rejects(importAudio(new File([bytes],'long.wav'),repo,new AbortController().signal),/ten minutes/i);
 await assert.rejects(importAudio(new File([bytes],'cancelled.wav'),repo,abort.signal),/abort/i);
 assert.equal((await repo.listRiffs()).length,0);db.close();
});
