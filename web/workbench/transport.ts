import type { NoteEvent } from '../../src/types.ts';
import type { AudioRegion, PcmAudio, PlaybackSource } from '../../src/workbench/types.ts';
import { validatePcm } from '../../src/workbench/regions.ts';
import { stretchAudio } from './processing.ts';
export interface TransportSnapshot {playing:boolean;processing:boolean;positionSeconds:number;durationSeconds:number;gain:number;error?:string}
interface Options {
 repository:{readRegion:(region:AudioRegion)=>Promise<PcmAudio>};context:AudioContext|(()=>AudioContext);
 renderNotes:(notes:NoteEvent[],sampleRate:number)=>Promise<PcmAudio>;onChange:(state:TransportSnapshot)=>void;
 stretch?:(audio:PcmAudio,factor:number,signal:AbortSignal)=>Promise<PcmAudio>;
 beforePlay?:()=>boolean;
}
export class AudioTransport {
 private options:Options;
 private state:TransportSnapshot={playing:false,processing:false,positionSeconds:0,durationSeconds:0,gain:.8};
 private generation=0;private abort:AbortController|null=null;private settle:(()=>void)|null=null;
 private source:AudioBufferSourceNode|null=null;private gain:GainNode|null=null;private timer:ReturnType<typeof setInterval>|null=null;
 private cache=new Map<string,PcmAudio>();
 constructor(options:Options){this.options=options;}
 get snapshot():TransportSnapshot{return {...this.state};}
 private emit():void{this.options.onChange(this.snapshot);}
 private context():AudioContext{return typeof this.options.context==='function'?this.options.context():this.options.context;}
 play(source:PlaybackSource,options:{loop?:boolean;speed?:1|.75|.5}={}):Promise<void>{
   const key=source.kind==='audio'?JSON.stringify([source.region,options.speed??1]):'';
   return this.begin(async signal=>{
     let pcm=source.kind==='audio'?await this.options.repository.readRegion(source.region):await this.options.renderNotes(source.notes,this.context().sampleRate);
     signal.throwIfAborted();
     if(options.speed && options.speed!==1){
       const hit=key?this.cache.get(key):undefined;
       pcm=hit??await (this.options.stretch??stretchAudio)(pcm,1/options.speed,signal);
       signal.throwIfAborted();
       if(key && pcm.channels[0]!.length*pcm.channels.length<12_000_000){if(this.cache.size>=2)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,pcm);}
     }
     return pcm;
   },options.loop??false);
 }
 playPcm(audio:PcmAudio,loop=false):Promise<void>{return this.begin(async()=>audio,loop);}
 private begin(load:(signal:AbortSignal)=>Promise<PcmAudio>,loop:boolean):Promise<void>{
  if(this.options.beforePlay?.()===false)return Promise.resolve();
  this.stop();const generation=this.generation,abort=new AbortController();this.abort=abort;
  this.state.processing=true;delete this.state.error;this.emit();
  return new Promise<void>((resolve,reject)=>{
   this.settle=resolve;
   void(async()=>{
    try{
     const context=this.context();if(context.state!=='running')await context.resume();
     if(generation!==this.generation)return;
     const pcm=await load(abort.signal);if(generation!==this.generation)return;validatePcm(pcm);
     const buffer=context.createBuffer(pcm.channels.length,pcm.channels[0]!.length,pcm.sampleRate);
     pcm.channels.forEach((channel,i)=>{
       const copy=channel.slice(),fade=Math.min(Math.round(pcm.sampleRate*.003),Math.floor(copy.length/2));
       for(let j=0;j<fade;j++){copy[j]!*=j/fade;copy[copy.length-1-j]!*=j/fade;}buffer.copyToChannel(copy,i);
     });
     const source=context.createBufferSource(),gain=context.createGain();this.source=source;this.gain=gain;
     source.buffer=buffer;source.loop=loop;gain.gain.value=this.state.gain;source.connect(gain);gain.connect(context.destination);
     this.state={...this.state,playing:true,processing:false,positionSeconds:0,durationSeconds:buffer.duration};
     const started=context.currentTime;
     source.onended=()=>{if(generation===this.generation){this.stop();this.state.positionSeconds=buffer.duration;this.emit();}};
     source.start();this.timer=setInterval(()=>{const elapsed=Math.max(0,context.currentTime-started);this.state.positionSeconds=loop?elapsed%buffer.duration:Math.min(elapsed,buffer.duration);this.emit();},100);this.emit();
    }catch(error){if(generation!==this.generation)return;this.settle=null;this.stop();this.state.error=error instanceof Error?error.message:String(error);this.emit();reject(error);}
   })();
  });
 }
 setGain(value:number):void{if(!Number.isFinite(value)||value<0||value>1)throw new Error('Output level must be between 0 and 1');this.state.gain=value;if(this.gain)this.gain.gain.value=value;this.emit();}
 stop():void{
  ++this.generation;this.abort?.abort();this.abort=null;
  if(this.timer)clearInterval(this.timer);this.timer=null;
  if(this.source){this.source.onended=null;try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}
  this.gain?.disconnect();this.gain=null;const settle=this.settle;this.settle=null;
  this.state.playing=false;this.state.processing=false;this.state.positionSeconds=0;settle?.();this.emit();
 }
}
