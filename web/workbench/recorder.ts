import { MAX_PENDING_SECONDS, MAX_TAKE_SECONDS } from '../../src/workbench/types.ts';
import type { AudioChunk, KeptTake, PcmAudio, TakeTarget } from '../../src/workbench/types.ts';
import { makeId } from '../../src/util/id.ts';
import type { WorkbenchRepository } from './repository.ts';
import { MicCapture } from '../audio/capture.ts';

export interface CapturePort {
  start(onAudio:(chunk:Float32Array)=>void,onInterrupted:(reason:string)=>void):Promise<{sampleRate:number}>;
  stop():Promise<void>;
}
export interface RecordingSnapshot {
  status:'idle'|'requesting'|'recording'|'finalizing'|'saved'|'recoverable';
  capturedSamples:number; committedSamples:number; sampleRate:number;
  error?:string; level:number; peaks:Array<{min:number;max:number}>; markers:number[]; kept?:KeptTake;
}
interface Options { capture:CapturePort; repository:WorkbenchRepository; stopPlayback:()=>void|Promise<void>; onChange:(state:RecordingSnapshot)=>void; acquireLock?:()=>Promise<()=>void> }

export class RecordingController {
  private options:Options;
  private state:RecordingSnapshot={status:'idle',capturedSamples:0,committedSamples:0,sampleRate:0,level:0,peaks:[],markers:[]};
  private epoch=0;
  private starting:Promise<void>|null=null;
  private stopping:Promise<KeptTake|null>|null=null;
  private writer:Promise<void>|null=null;
  private assetId='';
  private ready=false;
  private accepting=false;
  private failed=false;
  private target:TakeTarget;
  private queue:AudioChunk[]=[];
  private partial=new Float32Array(0);
  private filled=0;
  private nextIndex=0;
  private nextStart=0;
  private early:Float32Array[]=[];
  private releaseLock:(()=>void)|null=null;
  constructor(options:Options){this.options=options;}
  get snapshot():RecordingSnapshot{return {...this.state,markers:[...this.state.markers],peaks:[...this.state.peaks]};}
  private emit():void{this.options.onChange(this.snapshot);}

  start(target?:TakeTarget):Promise<void>{
    if(this.starting)return this.starting;
    if(['requesting','recording','finalizing'].includes(this.state.status))return Promise.resolve();
    if(this.state.status==='recoverable')return Promise.reject(new Error('Download or dismiss the recoverable take first.'));
    this.state={status:'requesting',capturedSamples:0,committedSamples:0,sampleRate:0,level:0,peaks:[],markers:[]};
    this.queue=[];this.filled=0;this.nextIndex=0;this.nextStart=0;this.early=[];this.ready=false;this.failed=false;
    this.assetId=makeId('audio');this.target=target;this.accepting=true;this.emit();
    const epoch=++this.epoch;
    this.starting=this.begin(epoch).finally(()=>{this.starting=null;});return this.starting;
  }
  private async begin(epoch:number):Promise<void>{
    try{
      await this.options.stopPlayback();
      if(epoch!==this.epoch)return;
      if(this.options.acquireLock){this.releaseLock=await this.options.acquireLock();if(epoch!==this.epoch){this.releaseLock();this.releaseLock=null;return;}}
      const result=await this.options.capture.start(chunk=>{
        if(epoch!==this.epoch || !this.accepting)return;
        if(!this.ready){
          if(this.early.reduce((n,c)=>n+c.length,0)<240000)this.early.push(chunk.slice());
          else void this.interrupt('Storage did not open in time. Download the captured audio before continuing.');
        }else this.receive(chunk);
      },reason=>{if(epoch===this.epoch)void this.interrupt(reason);});
      if(epoch!==this.epoch){await this.options.capture.stop();return;}
      this.state.sampleRate=result.sampleRate;this.partial=new Float32Array(result.sampleRate);
      await this.options.repository.beginAsset({id:this.assetId,source:'microphone',state:'recording',sampleRate:result.sampleRate,channelCount:1,sampleCount:0,createdAt:Date.now(),markers:[]});
      if(epoch!==this.epoch)return;
      this.ready=true;const early=this.early;this.early=[];for(const chunk of early)this.receive(chunk);
      this.emit();
    }catch(error){
      if(epoch!==this.epoch)return;
      this.accepting=false;await this.options.capture.stop().catch(()=>{});
      this.state.status=this.state.capturedSamples?'recoverable':'idle';
      if(this.state.status==='idle'){this.releaseLock?.();this.releaseLock=null;}
      this.state.error=error instanceof Error?error.message:String(error);this.emit();
    }
  }
  private receive(chunk:Float32Array):void{
    if(!this.accepting || !chunk.length)return;
    const rate=this.state.sampleRate,remaining=MAX_TAKE_SECONDS*rate-this.state.capturedSamples;
    const capacity=MAX_PENDING_SECONDS*rate-(this.state.capturedSamples-this.state.committedSamples);
    const length=Math.min(chunk.length,remaining,Math.max(0,capacity));
    let min=0,max=0;
    for(let i=0;i<length;i++){
      const value=chunk[i]!;
      if(!Number.isFinite(value)){void this.interrupt('The input returned invalid audio. The captured portion can be downloaded.');return;}
      this.partial[this.filled++]=value;this.state.capturedSamples++;min=Math.min(min,value);max=Math.max(max,value);
      if(this.filled===this.partial.length)this.enqueue();
    }
    if(length){this.state.level=Math.min(1,Math.max(-min,max));this.state.peaks.push({min,max});if(this.state.peaks.length>1200)this.state.peaks=this.state.peaks.filter((_,i)=>i%2===0);}
    if(this.state.status==='requesting' && length)this.state.status='recording';this.emit();
    if(this.failed)return;
    if(this.state.capturedSamples>=MAX_TAKE_SECONDS*rate){void this.stop();}
    else if(length<chunk.length || this.state.capturedSamples-this.state.committedSamples>=MAX_PENDING_SECONDS*rate){
      void this.interrupt('Storage is taking too long. Recording stopped at the five-second pending limit. Download the rescue audio.');
    }
  }
  private enqueue():void{
    if(!this.filled)return;
    const samples=this.partial.slice(0,this.filled);
    this.queue.push({assetId:this.assetId,index:this.nextIndex++,startSample:this.nextStart,channels:[samples]});
    this.nextStart+=samples.length;this.partial=new Float32Array(this.state.sampleRate);this.filled=0;this.drain();
  }
  private drain():void{
    if(this.writer || this.failed || !this.queue.length)return;
    this.writer=(async()=>{
      while(this.queue.length && !this.failed){
        const chunk=this.queue[0]!;
        try {await this.options.repository.appendChunk(chunk);}
        catch(error){void this.interrupt(`Audio could not be saved: ${error instanceof Error?error.message:String(error)}. Download the rescue audio.`);break;}
        this.queue.shift();this.state.committedSamples=chunk.startSample+chunk.channels[0]!.length;this.emit();
      }
    })().finally(()=>{this.writer=null;if(this.queue.length && !this.failed)this.drain();});
  }
  mark():void{if(this.state.status==='recording'){this.state.markers.push(this.state.capturedSamples);this.emit();}}
  stop():Promise<KeptTake|null>{
    if(this.stopping)return this.stopping;
    if(this.state.status==='saved')return Promise.resolve(this.state.kept??null);
    if(this.state.status==='recoverable' || this.state.status==='idle')return Promise.resolve(null);
    if(!this.ready){
      ++this.epoch;this.accepting=false;this.state.status='idle';this.emit();
      this.releaseLock?.();this.releaseLock=null;
      return this.options.capture.stop().then(()=>null);
    }
    this.state.status='finalizing';this.emit();
    this.stopping=Promise.resolve().then(()=>this.finish()).finally(()=>{this.stopping=null;});return this.stopping;
  }
  private async finish():Promise<KeptTake|null>{
    try{
      await this.options.capture.stop();this.accepting=false;
      this.enqueue();while(this.writer)await this.writer;
      if(this.failed)return null;
      if(!this.state.capturedSamples){this.state.status='idle';this.releaseLock?.();this.releaseLock=null;this.emit();return null;}
      await this.options.repository.setMarkers(this.assetId,this.state.markers);
      const kept=await this.options.repository.finalizeTake(this.assetId,this.target);
      this.state.status='saved';this.state.kept=kept;this.state.level=0;++this.epoch;this.releaseLock?.();this.releaseLock=null;this.emit();return kept;
    }catch(error){await this.interrupt(error instanceof Error?error.message:String(error));return null;}
  }
  async interrupt(reason:string):Promise<void>{
    if(this.failed)return;
    this.failed=true;this.state.status='recoverable';this.state.error=reason;this.state.level=0;this.emit();
    // Preserve any worklet tail even though storage has failed; bound it to the remaining queue allowance.
    await this.options.capture.stop().catch(()=>{});this.accepting=false;
  }
  async rescue():Promise<PcmAudio>{
    if(!this.state.capturedSamples)throw new Error('No audio samples were captured');
    const channel=new Float32Array(this.state.capturedSamples);
    const asset=await this.options.repository.getAsset(this.assetId).catch(()=>null);
    if(asset?.sampleCount){const saved=await this.options.repository.readRegion({assetId:this.assetId,startSample:0,endSample:Math.min(asset.sampleCount,channel.length)});channel.set(saved.channels[0]!);}
    for(const chunk of this.queue)channel.set(chunk.channels[0]!,chunk.startSample);
    if(this.filled)channel.set(this.partial.subarray(0,this.filled),this.nextStart);
    return {sampleRate:this.state.sampleRate,channels:[channel]};
  }
  async acknowledgeRecovery():Promise<KeptTake|null>{
    if(this.state.status!=='recoverable')return null;
    if(this.writer)await this.writer;
    const asset=await this.options.repository.getAsset(this.assetId);
    const kept=asset?.sampleCount?await this.options.repository.finalizeInterrupted(this.assetId,this.target):null;
    this.releaseLock?.();this.releaseLock=null;
    ++this.epoch;this.queue=[];this.filled=0;this.state={status:'idle',capturedSamples:0,committedSamples:0,sampleRate:0,level:0,peaks:[],markers:[]};this.emit();return kept;
  }
}

/** Raw capture remains usable when note/chord analysis is unavailable. */
export class RawCapturePort implements CapturePort {
  private mic:MicCapture|null=null;
  deviceId='';
  async start(onAudio:(chunk:Float32Array)=>void,onInterrupted:(reason:string)=>void):Promise<{sampleRate:number}>{
    const mic=new MicCapture({onAudio,onNotes:()=>{},onFrame:()=>{},onError:()=>{},onInterrupted});
    mic.analysisEnabled=false;mic.deviceId=this.deviceId;this.mic=mic;
    await mic.start();return {sampleRate:mic.sampleRate};
  }
  async stop():Promise<void>{const mic=this.mic;this.mic=null;await mic?.stop();}
}
