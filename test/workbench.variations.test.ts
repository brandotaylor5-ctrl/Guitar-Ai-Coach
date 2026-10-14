import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVariations } from '../src/workbench/variations.ts';
import type { RiffVersion } from '../src/types.ts';
const version:RiffVersion={id:'v',parentId:null,label:'Take',createdAt:1,sourceKind:'recorded',recording:{assetId:'a',startSample:0,endSample:100},analysis:{state:'confirmed'},notes:[52,55,57,59,55].map((midi,i)=>({midi,startMs:i*500,durationMs:i===0?2000:400,confidence:1}))};
test('ending replaces only the chosen tail and preserves an earlier sustained note',()=>{
 const out=makeVariations(version,'ending',1500);assert.ok(out.length>0&&out.length<=3);
 for(const v of out){assert.deepEqual(v.notes.filter(n=>n.startMs<1500),version.notes.slice(0,3));assert.equal(v.sourceKind,'synthesized');assert.equal(v.recording,undefined);assert.equal(v.parentId,'v');}
 assert.equal(version.recording!.assetId,'a');
});
test('rhythm preserves pitch order and unconfirmed interpretations cannot produce variants',()=>{
 assert.deepEqual(makeVariations(version,'rhythm')[0]!.notes.map(n=>n.midi),version.notes.map(n=>n.midi));
 assert.throws(()=>makeVariations({...version,analysis:{state:'estimated'}},'rhythm'));
 assert.throws(()=>makeVariations(version,'ending',123));
});
