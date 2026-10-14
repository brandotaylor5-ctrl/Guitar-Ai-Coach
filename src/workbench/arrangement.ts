import type { Riff,SongSeed,NoteEvent } from '../types.ts';
import type { PlaybackSource,AudioRegion,PcmAudio } from './types.ts';
import { sourceForVersion,MAX_ARCHIVE_BYTES } from './types.ts';
import { validatePcm } from './regions.ts';
export interface ArrangementItem {sectionId:string;source:PlaybackSource;repeats:number}
export function resolveArrangement(song:SongSeed,riffs:Riff[]):ArrangementItem[]{
 return song.sections.map((section,i)=>{
  const riff=riffs.find(r=>r.id===section.riffId),version=riff?.versions.find(v=>v.id===section.versionId);
  if(!version)throw new Error(`Section ${i+1}: the pinned take is unavailable.`);
  const repeats=section.repeats??1;if(!Number.isInteger(repeats)||repeats<1||repeats>32)throw new Error('Section repeats must be between 1 and 32.');
  if(section.recording&&section.recording.assetId!==version.recording?.assetId)throw new Error('Section audio does not belong to its pinned take.');
  return {sectionId:section.id??`${song.id}:${i}`,source:section.recording?{kind:'audio',region:{...section.recording}}:sourceForVersion(version),repeats};
 });
}
export async function renderArrangement(items:ArrangementItem[],loadAudio:(region:AudioRegion)=>Promise<PcmAudio>,renderNotes:(notes:NoteEvent[],rate:number)=>Promise<PcmAudio>,sampleRate:number,signal:AbortSignal):Promise<PcmAudio>{
 signal.throwIfAborted();if(!items.length)throw new Error('Add a section before playing the song.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Invalid demo sample rate.');
 const sources:Array<{audio:PcmAudio;frames:number;repeats:number}>=[];let total=0,sourceBytes=0;
 for(const item of items){
  signal.throwIfAborted();if(!Number.isInteger(item.repeats)||item.repeats<1||item.repeats>32)throw new Error('Invalid section repeats.');
  const audio=item.source.kind==='audio'?await loadAudio(item.source.region):await renderNotes(item.source.notes,sampleRate);validatePcm(audio);
  const frames=Math.round(audio.channels[0]!.length*sampleRate/audio.sampleRate);total+=frames*item.repeats;sourceBytes+=audio.channels[0]!.length*audio.channels.length*4;
  if(total*8+sourceBytes>MAX_ARCHIVE_BYTES)throw new Error('This demo exceeds the 500 MB audio budget. Reduce the sections or repeats.');
  sources.push({audio,frames,repeats:item.repeats});
 }
 signal.throwIfAborted();const channels=[new Float32Array(total),new Float32Array(total)];let cursor=0;
 for(const {audio,frames,repeats} of sources){
  for(let repeat=0;repeat<repeats;repeat++){
   for(let i=0;i<frames;i++){
    if(i%65536===0){await new Promise<void>(resolve=>setTimeout(resolve,0));signal.throwIfAborted();}
    const at=i*audio.sampleRate/sampleRate,left=Math.min(Math.floor(at),audio.channels[0]!.length-1),right=Math.min(left+1,audio.channels[0]!.length-1),fraction=at-Math.floor(at);
    for(let channel=0;channel<2;channel++){const input=audio.channels[channel]??audio.channels[0]!;channels[channel]![cursor+i]=input[left]!*(1-fraction)+input[right]!*fraction;}
   }
   cursor+=frames;
  }
 }
 return {sampleRate,channels};
}
