import type { Riff, SongSeed } from '../../src/types.ts';
import type { PcmAudio } from '../../src/workbench/types.ts';
export function pcmFixture(options: {rate?:number;channels?:1|2;seconds?:number} = {}): PcmAudio {
  const rate=options.rate??44100, length=Math.round(rate*(options.seconds??.02));
  return {sampleRate:rate,channels:Array.from({length:options.channels??1},(_,c)=>Float32Array.from({length},(_,i)=>Math.sin(i*2*Math.PI*(220+c*110)/rate)*.3))};
}
export function riffFixture(): Riff {
  return {id:'riff-1',name:'Original',createdAt:1,updatedAt:1,currentVersionId:'v-1',tags:[],versions:[{id:'v-1',label:'Take 1',parentId:null,createdAt:1,notes:[{midi:55,startMs:0,durationMs:250,confidence:1}]}]};
}
export function songFixture(riff:Riff): SongSeed {
  return {id:'song-1',name:'My song',createdAt:2,sections:[{id:'section-1',role:'Intro',riffId:riff.id,versionId:riff.currentVersionId,repeats:1}]};
}
