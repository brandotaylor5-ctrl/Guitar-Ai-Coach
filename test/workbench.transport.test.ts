import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioTransport } from '../web/workbench/transport.ts';
import { timeStretchChannels } from '../src/audio/timeStretch.ts';
import type { PcmAudio } from '../src/workbench/types.ts';

function audio(){return {sampleRate:1000,channels:[new Float32Array(1000).fill(.5)]};}
function fakeContext(){
 const sources:Array<{stopped:boolean;started:boolean;onended:(()=>void)|null;buffer:unknown;loop:boolean;connect:()=>void;disconnect:()=>void;start:()=>void;stop:()=>void}>=[];
 const context={state:'running',sampleRate:1000,currentTime:0,destination:{},resume:async()=>{},
 createGain:()=>({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}),
 createBuffer:(count:number,length:number,rate:number)=>({duration:length/rate,copyToChannel(){},getChannelData:()=>new Float32Array(length)}),
 createBufferSource:()=>{const source={stopped:false,started:false,onended:null as (()=>void)|null,buffer:null as unknown,loop:false,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(source);return source;}};
 return {context:context as unknown as AudioContext,sources};
}
const source={kind:'audio' as const,region:{assetId:'a',startSample:0,endSample:1000}};

test('starting B cancels A and stop settles both awaited playbacks',async()=>{
 const {context,sources}=fakeContext();const transport=new AudioTransport({repository:{readRegion:async()=>audio()},context,renderNotes:async()=>audio(),onChange:()=>{}});
 const first=transport.play(source);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sources.length,1);const second=transport.play(source,{loop:true});await first;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sources[0]!.stopped,true);assert.equal(sources[1]!.loop,true);transport.stop();await second;assert.equal(transport.snapshot.playing,false);
});
test('late processing output cannot restart cancelled playback',async()=>{
 const {context,sources}=fakeContext();let release!:(audio:PcmAudio)=>void;
 const transport=new AudioTransport({repository:{readRegion:async()=>audio()},context,renderNotes:async()=>audio(),onChange:()=>{},stretch:async()=>new Promise(resolve=>{release=resolve;})});
 const pending=transport.play(source,{speed:.5});await new Promise(resolve=>setImmediate(resolve));transport.stop();await pending;
 release(audio());await new Promise(resolve=>setImmediate(resolve));assert.equal(sources.length,0);
});
test('playback load failures reach the caller and clear processing state',async()=>{
 const {context}=fakeContext();const transport=new AudioTransport({repository:{readRegion:async()=>{throw new Error('Recording unavailable');}},context,renderNotes:async()=>audio(),onChange:()=>{}});
 await assert.rejects(transport.play(source),/Recording unavailable/);assert.equal(transport.snapshot.processing,false);
});
test('stereo stretching shares alignment without losing polarity',()=>{
 const left=Float32Array.from({length:12000},(_,i)=>Math.sin(i*2*Math.PI*220/44100));const right=Float32Array.from(left,v=>-v);
 const [a,b]=timeStretchChannels([left,right],2);assert.ok(a!.length>20000);assert.equal(a!.length,b!.length);
 for(let i=0;i<a!.length;i+=37)assert.ok(Math.abs(a![i]!+b![i]!)<1e-6);
 assert.equal(left.length,12000);
});
