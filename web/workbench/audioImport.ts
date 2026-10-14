import { MAX_IMPORT_BYTES, MAX_TAKE_SECONDS } from '../../src/workbench/types.ts';
import type { KeptTake, PcmAudio, TakeTarget } from '../../src/workbench/types.ts';
import { validatePcm } from '../../src/workbench/regions.ts';
import { makeId } from '../../src/util/id.ts';
import { decodePcmWav } from '../audio/pcmWav.ts';
import type { WorkbenchRepository } from './repository.ts';

export async function decodeAudioFile(file:File,signal:AbortSignal):Promise<{audio:PcmAudio;native:boolean}>{
  signal.throwIfAborted();
  if(file.size>MAX_IMPORT_BYTES)throw new Error('Choose an audio file under 100 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());signal.throwIfAborted();
  if(new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'){
    try{return {audio:decodePcmWav(bytes),native:true};}
    catch(error){if(!(error instanceof Error) || !/Unsupported WAV format/.test(error.message))throw error;}
  }
  if(typeof AudioContext==='undefined')throw new Error('This browser cannot decode that audio format. Try a WAV export.');
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(bytes.buffer);signal.throwIfAborted();
    if(buffer.numberOfChannels<1 || buffer.numberOfChannels>2)throw new Error('Use mono or stereo audio.');
    if(buffer.duration>MAX_TAKE_SECONDS)throw new Error('Choose a recording of ten minutes or less.');
    return {audio:{sampleRate:buffer.sampleRate,channels:Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice())},native:false};
  }catch(error){if(signal.aborted)throw signal.reason;throw new Error(`Could not decode this recording: ${error instanceof Error?error.message:String(error)} Try WAV, M4A, MP3, or another format supported by your browser.`);}
  finally{await context.close();}
}

export async function importAudio(file:File,repo:WorkbenchRepository,signal:AbortSignal,target?:TakeTarget):Promise<KeptTake>{
  const {audio,native}=await decodeAudioFile(file,signal);validatePcm(audio);
  const length=audio.channels[0]!.length;
  if(length/audio.sampleRate>MAX_TAKE_SECONDS)throw new Error('Choose a recording of ten minutes or less.');
  signal.throwIfAborted();const id=makeId('audio');
  await repo.beginAsset({id,source:'import',state:'recording',sampleRate:audio.sampleRate,channelCount:audio.channels.length,sampleCount:0,createdAt:Date.now(),markers:[],
    originalFilename:file.name,originalMime:file.type,originalBlob:file,importDecode:native?'native-pcm':'browser-decoded'});
  try{
    for(let start=0,index=0;start<length;start+=audio.sampleRate,index++){
      signal.throwIfAborted();await repo.appendChunk({assetId:id,index,startSample:start,channels:audio.channels.map(c=>c.slice(start,Math.min(length,start+audio.sampleRate)))});
    }
    signal.throwIfAborted();return await repo.finalizeTake(id,target);
  }catch(error){await repo.abandonAsset(id).catch(()=>{});throw error;}
}
