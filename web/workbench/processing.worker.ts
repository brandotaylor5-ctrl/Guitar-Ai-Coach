import { timeStretchChannels } from '../../src/audio/timeStretch.ts';
import { FrameStreamer } from '../../src/audio/stream.ts';
import { NoteTracker } from '../../src/audio/noteTracker.ts';
import type { PcmAudio } from '../../src/workbench/types.ts';
import type { NoteEvent } from '../../src/types.ts';
const scope=self as unknown as {onmessage:((event:MessageEvent<{id:string;op:'stretch'|'analyze';audio:PcmAudio;factor:number}>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=event=>{
 const {id,op,audio,factor}=event.data;
 try{
  if(op==='stretch'){scope.postMessage({id,audio:{sampleRate:audio.sampleRate,channels:timeStretchChannels(audio.channels,factor)}});return;}
  const streamer=new FrameStreamer({sampleRate:audio.sampleRate}),tracker=new NoteTracker(),notes:NoteEvent[]=[];
  const mono=audio.channels[0]!;
  for(let i=0;i<mono.length;i+=8192)for(const frame of streamer.push(mono.subarray(i,i+8192)))notes.push(...tracker.process(frame));
  notes.push(...tracker.flush(streamer.currentTimeMs));scope.postMessage({id,notes});
 }catch(error){scope.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
