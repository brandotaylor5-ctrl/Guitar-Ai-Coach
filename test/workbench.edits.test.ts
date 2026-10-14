import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory, validateNotes } from '../src/workbench/edits.ts';
import { midiFile } from '../src/workbench/midi.ts';
test('history owns its snapshots and truncates redo only after a new edit',()=>{
 const input={value:1};const history=new EditHistory(input);input.value=9;
 const next=history.apply({value:2});next.value=8;
 assert.deepEqual(history.undo(),{value:1});assert.deepEqual(history.redo(),{value:2});
 history.undo();history.apply({value:3});assert.equal(history.canRedo,false);
});
test('notes reject invalid time, order, and unplayable pitches before tab inference',()=>{
 const notes=[{midi:40,startMs:0,durationMs:500,confidence:.8}];validateNotes(notes);
 for(const change of [{durationMs:0},{startMs:NaN},{midi:20}])assert.throws(()=>validateNotes([{...notes[0]!,...change}]));
 assert.throws(()=>validateNotes([{...notes[0]!,startMs:300},notes[0]!]));
});
test('MIDI exports actual onset timing, note duration and velocity in a standard single track',()=>{
 const midi=midiFile([{midi:60,startMs:500,durationMs:250,confidence:1,velocity:.5}]);
 assert.equal(new TextDecoder().decode(midi.slice(0,4)),'MThd');assert.equal(new TextDecoder().decode(midi.slice(14,18)),'MTrk');
 assert.ok(Buffer.from(midi).includes(Buffer.from([0x83,0x60,0x90,60,64])));
 assert.ok(Buffer.from(midi).includes(Buffer.from([0x81,0x70,0x80,60,0])));
});
