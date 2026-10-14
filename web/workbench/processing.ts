import type { PcmAudio } from '../../src/workbench/types.ts';
import type { NoteEvent } from '../../src/types.ts';

export function processAudio<T>(op:'stretch'|'analyze',audio:PcmAudio,signal:AbortSignal,factor=1):Promise<T>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./processing.worker.js',import.meta.url),{type:'module'}),id=crypto.randomUUID();
    const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(signal.reason??new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>{cleanup();reject(new Error(event.message||'Audio processing failed'));};
    worker.onmessage=event=>{if(event.data.id!==id)return;cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.audio??event.data.notes);};
    // Structured clone leaves the editor's source buffers intact.
    worker.postMessage({id,op,audio,factor});
  });
}
export function stretchAudio(audio:PcmAudio,factor:number,signal:AbortSignal):Promise<PcmAudio>{return processAudio('stretch',audio,signal,factor);}
export function analyzeRecordedRegion(audio:PcmAudio,signal:AbortSignal):Promise<NoteEvent[]>{return processAudio('analyze',audio,signal);}
