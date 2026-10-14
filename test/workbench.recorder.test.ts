import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { openWorkbenchDatabase } from '../web/workbench/database.ts';
import { WorkbenchRepository } from '../web/workbench/repository.ts';
import { RecordingController } from '../web/workbench/recorder.ts';
import type { CapturePort } from '../web/workbench/recorder.ts';

class FakeCapture implements CapturePort {
  onAudio:(chunk:Float32Array)=>void=()=>{}; opens=0; closed=0; tail=new Float32Array(0);
  async start(onAudio:(chunk:Float32Array)=>void){this.onAudio=onAudio;this.opens++;return {sampleRate:1000};}
  async stop(){this.closed++;if(this.tail.length){const tail=this.tail;this.tail=new Float32Array(0);this.onAudio(tail);}}
}
async function setup(){const db=await openWorkbenchDatabase(new IDBFactory()),repository=new WorkbenchRepository(db),capture=new FakeCapture();
 const waiters:Array<()=>void>=[];
 const recorder=new RecordingController({capture,repository,stopPlayback:()=>{},onChange:()=>waiters.forEach(fn=>fn())});
 const waitCommitted=(n:number)=>new Promise<void>(resolve=>{const check=()=>{if(recorder.snapshot.committedSamples>=n)resolve();};waiters.push(check);check();});
 return {db,repository,capture,recorder,waitCommitted};}

test('stop flushes the final 127 samples and waits for committed storage',async()=>{
 const {db,repository,capture,recorder}=await setup();await recorder.start();
 capture.onAudio(new Float32Array(1000).fill(.25));capture.tail=new Float32Array(127).fill(.5);
 const promise=recorder.stop();assert.notEqual(recorder.snapshot.status,'saved');const kept=await promise;
 const riff=(await repository.getRiff(kept!.riffId))!;const audio=await repository.readRegion(riff.versions[0]!.recording!);
 assert.equal(audio.channels[0]!.length,1127);assert.equal(audio.channels[0]![1126],.5);assert.equal(recorder.snapshot.status,'saved');db.close();
});
test('double record opens one microphone and raw recording needs no detector',async()=>{
 const {db,repository,capture,recorder}=await setup();await Promise.all([recorder.start(),recorder.start()]);assert.equal(capture.opens,1);
 assert.equal(recorder.snapshot.status,'requesting');capture.onAudio(new Float32Array([.2,.3]));assert.equal(recorder.snapshot.status,'recording');
 await recorder.stop();assert.equal((await repository.listRiffs())[0]!.versions[0]!.notes.length,0);db.close();
});
test('late microphone permission cannot resurrect a cancelled capture',async()=>{
 const {db,repository}=await setup();let allow!:(value:{sampleRate:number})=>void;let callback=(c:Float32Array)=>{};let closes=0;
 const capture:CapturePort={start:async cb=>{callback=cb;return new Promise(resolve=>{allow=resolve;});},stop:async()=>{closes++;}};
 const recorder=new RecordingController({capture,repository,stopPlayback:()=>{},onChange:()=>{}});
 const pending=recorder.start();await Promise.resolve();await recorder.stop();allow({sampleRate:1000});await pending;callback(new Float32Array([1]));
 assert.equal(recorder.snapshot.status,'idle');assert.equal((await repository.listRiffs()).length,0);assert.ok(closes>=1);db.close();
});
test('storage stalls halt at a five-second pending queue and preserve rescue samples',async()=>{
 const {db,repository,capture,recorder}=await setup();let finish!:()=>void;
 const actual=repository.appendChunk.bind(repository);repository.appendChunk=async chunk=>{await new Promise<void>(resolve=>{finish=resolve;});return actual(chunk);};
 await recorder.start();capture.onAudio(new Float32Array(6000).fill(.25));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(recorder.snapshot.status,'recoverable');assert.ok(recorder.snapshot.capturedSamples<=5000);assert.ok(capture.closed>0);
 const rescue=await recorder.rescue();assert.equal(rescue.channels[0]!.length,5000);assert.equal(rescue.channels[0]![4999],.25);
 finish();await new Promise(resolve=>setTimeout(resolve,5));db.close();
});
test('recovery waits for the interrupted worklet tail before downloading or acknowledging',async()=>{
 const {db,capture,recorder,waitCommitted}=await setup();await recorder.start();capture.onAudio(new Float32Array(1000).fill(.25));await waitCommitted(1000);
 let flush!:()=>void;capture.stop=()=>new Promise<void>(resolve=>{flush=()=>{capture.onAudio(new Float32Array(127).fill(.5));resolve();};});
 const interrupted=recorder.interrupt('Device paused'),rescue=recorder.rescue();
 await new Promise(resolve=>setTimeout(resolve,5));flush();await interrupted;
 assert.equal((await rescue).channels[0]!.length,1127);await recorder.acknowledgeRecovery();db.close();
});
test('recording limit uses captured samples and keeps exactly ten minutes',{timeout:5000},async()=>{
 const {db,repository,capture,recorder,waitCommitted}=await setup();await recorder.start();
 for(let i=0;i<600;i++){capture.onAudio(new Float32Array(1000).fill(.1));await waitCommitted((i+1)*1000);}
 capture.onAudio(new Float32Array(100));await recorder.stop();
 assert.equal(recorder.snapshot.capturedSamples,600000);assert.equal((await repository.listAssets())[0]!.sampleCount,600000);db.close();
});
test('worklet flush sends partial samples exactly once before acknowledgement',async()=>{
 const messages:unknown[]=[];let Processor:any;
 vm.runInNewContext(await readFile(new URL('../web/capture-worklet.js',import.meta.url),'utf8'),{
  AudioWorkletProcessor:class{port={postMessage:(m:unknown)=>messages.push(m),onmessage:null};},
  registerProcessor:(_name:string,value:unknown)=>{Processor=value;},Float32Array,
 });
 const processor=new Processor();processor.process([[new Float32Array(127).fill(.5)]]);
 processor.port.onmessage({data:{type:'flush',id:3}});processor.process([[new Float32Array(128)]]);
 processor.port.onmessage({data:{type:'flush',id:4}});
 assert.equal((messages[0] as Float32Array).length,127);assert.equal((messages[1] as {type:string}).type,'flushed');
 assert.equal(messages.filter(m=>m instanceof Float32Array).length,1);
});
