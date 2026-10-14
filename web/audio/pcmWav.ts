import type { PcmAudio } from '../../src/workbench/types.ts';
import { validatePcm } from '../../src/workbench/regions.ts';

/** Portable, interleaved PCM. Float32 is the lossless project-backup format. */
export function encodePcmWav(audio: PcmAudio, format: 'pcm16'|'float32'): Uint8Array {
  validatePcm(audio);
  const channels = audio.channels.length, width = format === 'float32' ? 4 : 2;
  const frames = audio.channels[0]!.length, size = frames * channels * width;
  if (size > 0xffffffff - 36) throw new Error('Audio is too large for WAV');
  const bytes = new Uint8Array(44 + size), view = new DataView(bytes.buffer);
  const text = (at:number, value:string) => bytes.set(new TextEncoder().encode(value), at);
  text(0,'RIFF'); view.setUint32(4,36+size,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,format === 'float32' ? 3 : 1,true);
  view.setUint16(22,channels,true); view.setUint32(24,audio.sampleRate,true);
  view.setUint32(28,audio.sampleRate*channels*width,true); view.setUint16(32,channels*width,true);
  view.setUint16(34,width*8,true); text(36,'data'); view.setUint32(40,size,true);
  let offset = 44;
  for (let i=0;i<frames;i++) for (const channel of audio.channels) {
    const sample = channel[i]!;
    if (format === 'float32') view.setFloat32(offset,sample,true);
    else { const clamped = Math.max(-1,Math.min(1,sample)); view.setInt16(offset,Math.round(clamped * (clamped < 0 ? 32768 : 32767)),true); }
    offset += width;
  }
  return bytes;
}

export function decodePcmWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text = (at:number,len:number) => new TextDecoder().decode(bytes.subarray(at,at+len));
  if (bytes.length < 44 || text(0,4) !== 'RIFF' || text(8,4) !== 'WAVE') throw new Error('Not a PCM WAV file');
  const bound = view.getUint32(4,true)+8;
  if (bound > bytes.length || bound < 44) throw new Error('Truncated WAV');
  let fmt = -1, data = -1, size = 0;
  for (let at=12; at+8<=bound;) {
    const length = view.getUint32(at+4,true), next = at+8+length;
    if (next > bound) throw new Error('Truncated WAV chunk');
    if (text(at,4)==='fmt ') { if (length<16) throw new Error('Invalid WAV format'); fmt=at+8; }
    if (text(at,4)==='data') { if (data >= 0) throw new Error('Multiple WAV data chunks are unsupported'); data=at+8; size=length; }
    at=next+(length%2);
  }
  if (fmt<0 || data<0) throw new Error('WAV is missing format or samples');
  const code=view.getUint16(fmt,true), count=view.getUint16(fmt+2,true), rate=view.getUint32(fmt+4,true);
  const bits=view.getUint16(fmt+14,true), width=bits/8, align=view.getUint16(fmt+12,true);
  if (!((code===1 && [16,24,32].includes(bits)) || (code===3 && bits===32))) throw new Error('Unsupported WAV format');
  if (count<1 || count>2 || align!==count*width || size%align!==0) throw new Error('Invalid WAV channels or sample alignment');
  const frames=size/align, channels=Array.from({length:count},()=>new Float32Array(frames));
  let offset=data;
  for(let i=0;i<frames;i++) for(const channel of channels) {
    if(code===3) channel[i]=view.getFloat32(offset,true);
    else if(bits===16) channel[i]=view.getInt16(offset,true)/32768;
    else if(bits===32) channel[i]=view.getInt32(offset,true)/2147483648;
    else { let n=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|(view.getUint8(offset+2)<<16); if(n&0x800000)n-=0x1000000; channel[i]=n/8388608; }
    offset+=width;
  }
  const audio={sampleRate:rate,channels}; validatePcm(audio); return audio;
}
