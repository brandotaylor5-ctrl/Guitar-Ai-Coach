import test from 'node:test';
import assert from 'node:assert/strict';
import { renderNotePcm } from '../web/audio/playback.ts';
test('synthesized exports preserve note offsets and velocity contrast',async()=>{
 const note={midi:55,startMs:250,durationMs:200,confidence:1,velocity:.2};
 const quiet=await renderNotePcm([note],44100),loud=await renderNotePcm([{...note,velocity:.9}],44100);
 assert.equal(quiet.channels[0]!.subarray(0,10000).some(n=>n!==0),false);
 const peak=(c:Float32Array)=>c.reduce((p,n)=>Math.max(p,Math.abs(n)),0);
 assert.ok(peak(loud.channels[0]!)>peak(quiet.channels[0]!));assert.ok(quiet.channels[0]!.every(Number.isFinite));
});
