import type { NoteEvent } from '../types.ts';
/** Standard MIDI file, fixed 120 BPM / 480 PPQ. Millisecond timing is retained to the nearest tick. */
export function midiFile(notes:NoteEvent[]):Uint8Array{
 const events:Array<{tick:number;data:number[]}>=[];
 for(const n of notes){
  if(!Number.isInteger(n.midi)||n.midi<0||n.midi>127||!Number.isFinite(n.startMs)||n.startMs<0||!Number.isFinite(n.durationMs)||n.durationMs<=0||n.startMs+n.durationMs>600000)throw new Error('Invalid MIDI note');
  const start=Math.round(n.startMs*.96);events.push({tick:start,data:[0x90,n.midi,Math.max(1,Math.min(127,Math.round((n.velocity??.7)*127)))]},
   {tick:Math.max(start+1,Math.round((n.startMs+n.durationMs)*.96)),data:[0x80,n.midi,0]});
 }
 events.sort((a,b)=>a.tick-b.tick||a.data[0]!-b.data[0]!);
 const track=[0,0xff,0x51,3,7,0xa1,0x20,0,0xc0,24];let at=0;
 for(const e of events){let delta=e.tick-at;const vlq=[delta&127];while((delta>>>=7)>0)vlq.unshift((delta&127)|128);track.push(...vlq,...e.data);at=e.tick;}
 track.push(0,0xff,0x2f,0);
 const result=new Uint8Array(22+track.length);result.set([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107]);new DataView(result.buffer).setUint32(18,track.length);result.set(track,22);return result;
}
