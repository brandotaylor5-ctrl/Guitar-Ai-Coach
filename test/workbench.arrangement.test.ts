import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveArrangement,renderArrangement } from '../src/workbench/arrangement.ts';
import type { Riff,SongSeed } from '../src/types.ts';
const riff:Riff={id:'r',name:null,createdAt:1,updatedAt:1,currentVersionId:'b',tags:[],versions:[{id:'a',label:'A',parentId:null,notes:[],createdAt:1,recording:{assetId:'audio',startSample:0,endSample:441}},{id:'b',label:'B',parentId:'a',notes:[],createdAt:2,recording:{assetId:'other',startSample:0,endSample:480}}]};
const song:SongSeed={id:'s',name:'Own song',createdAt:1,sections:[{id:'section',riffId:'r',versionId:'a',role:'Verse',repeats:2}]};
test('arrangements resolve the pinned version, independent of favorite changes',()=>{
 const items=resolveArrangement(song,[riff]);assert.equal(items[0]!.source.kind,'audio');assert.equal(items[0]!.source.kind==='audio'&&items[0]!.source.region.assetId,'audio');
 assert.throws(()=>resolveArrangement({...song,sections:[{...song.sections[0]!,versionId:'gone'}]},[riff]),/unavailable/);
 assert.throws(()=>resolveArrangement({...song,sections:[{...song.sections[0]!,repeats:0}]},[riff]));
});
test('mixed rates and repeats preserve duration and stereo without moving pitch',async()=>{
 const items=resolveArrangement({...song,sections:[...song.sections,{id:'second',riffId:'r',versionId:'b',role:'End'}]},[riff]);
 const result=await renderArrangement(items,async region=>({sampleRate:region.assetId==='audio'?44100:48000,channels:[new Float32Array(region.endSample).fill(.25),new Float32Array(region.endSample).fill(-.1)]}),async()=>{throw new Error('Not synthesized');},48000,new AbortController().signal);
 assert.equal(result.channels[0]!.length,1440);assert.equal(result.channels.length,2);
 assert.equal(result.channels[0]![700],.25);assert.ok(Math.abs(result.channels[1]![700]!+.1)<1e-7);
});
test('arrangement failures and cancellation cannot produce a partial demo',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(renderArrangement(resolveArrangement(song,[riff]),async()=>{throw new Error('missing audio');},async()=>{throw 0;},48000,new AbortController().signal),/missing audio/);
 await assert.rejects(renderArrangement([],async()=>{throw 0;},async()=>{throw 0;},48000,controller.signal));
});
