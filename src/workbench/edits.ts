import type { NoteEvent, RiffVersion } from '../types.ts';
import { positionsFor, STANDARD_TUNING, withCapo } from '../music/fretboard.ts';
export class EditHistory<T> {
 private states:T[];private cursor=0;
 constructor(initial:T){this.states=[structuredClone(initial)];}
 get canUndo():boolean{return this.cursor>0;}
 get canRedo():boolean{return this.cursor<this.states.length-1;}
 apply(next:T):T{this.states=this.states.slice(0,this.cursor+1);this.states.push(structuredClone(next));this.cursor++;return structuredClone(next);}
 undo():T{if(this.canUndo)this.cursor--;return structuredClone(this.states[this.cursor]!);}
 redo():T{if(this.canRedo)this.cursor++;return structuredClone(this.states[this.cursor]!);}
}
export function versionTuning(version:Pick<RiffVersion,'tuningSnapshot'>){
 const tuning=version.tuningSnapshot;return tuning?withCapo({name:tuning.name,strings:tuning.strings},tuning.capo):STANDARD_TUNING;
}
export function validateNotes(notes:NoteEvent[],version:Pick<RiffVersion,'tuningSnapshot'>={}):void{
 if(!notes.length || notes.length>10000)throw new Error('Use between 1 and 10,000 notes.');
 const tuning=versionTuning(version);let previous=-1;
 for(const note of notes){
  if(!Number.isInteger(note.midi)||!positionsFor(note.midi,tuning,22-(version.tuningSnapshot?.capo??0)).length)throw new Error('A pitch is outside this guitar tuning and capo range.');
  if(!Number.isFinite(note.startMs)||note.startMs<0||note.startMs<previous||!Number.isFinite(note.durationMs)||note.durationMs<=0||note.startMs+note.durationMs>600000)throw new Error('Notes need ordered onsets and positive durations within ten minutes.');
  if(!Number.isFinite(note.confidence)||note.confidence<0||note.confidence>1||note.velocity!==undefined&&(!Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1))throw new Error('Invalid note confidence or velocity.');
  previous=note.startMs;
 }
}
