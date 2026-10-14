import test from 'node:test';
import assert from 'node:assert/strict';
import { RiffPlayer } from '../web/audio/playback.ts';

test('legacy note playback settles exactly once when stopped',{timeout:500},async()=>{
 const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const timers=new Map<number,()=>void>();let id=0;
 const ctx={state:'running',sampleRate:44100,currentTime:0,destination:{},
  createBuffer:(_count:number,length:number)=>({getChannelData:()=>new Float32Array(length)}),
  createBufferSource:()=>({connect(){},start(){},stop(){}}),
  createGain:()=>({gain:param(),connect(){},disconnect(){}}),
  createBiquadFilter:()=>({frequency:param(),Q:param(),gain:param(),connect(){}}),
  createDynamicsCompressor:()=>({context:ctx,threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}})};
 const oldWindow=globalThis.window,oldContext=globalThis.AudioContext;
 Object.assign(globalThis,{window:{setTimeout:(fn:()=>void)=>{timers.set(++id,fn);return id;},clearTimeout:(n:number)=>timers.delete(n)},AudioContext:function(){return ctx;}});
 try{const player=new RiffPlayer();let ended=0;const pending=player.play([{midi:55,startMs:0,durationMs:200,confidence:1}],{onEnd:()=>{ended++;}});
  await Promise.resolve();player.stop();await pending;player.stop();assert.equal(ended,1);
 }finally{Object.assign(globalThis,{window:oldWindow,AudioContext:oldContext});}
});
test('playback admission blocks legacy notes and samples before audio opens',async()=>{
 let checked=0;const player=new RiffPlayer({beforePlay:()=>{checked++;return false;}});
 await player.play([{midi:60,startMs:0,durationMs:100,confidence:1}]);await player.playSamples(new Float32Array([.1]),48000);
 assert.equal(checked,2);assert.equal(player.isPlaying,false);
});
