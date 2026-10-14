import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePcmWav, decodePcmWav } from '../web/audio/pcmWav.ts';

test('stereo float WAV survives exactly', () => {
  const stereo = {sampleRate:44100,channels:[new Float32Array([0,.125,-1,1.5]),new Float32Array([.5,-.25,.75,0])]};
  assert.deepEqual(decodePcmWav(encodePcmWav(stereo,'float32')),stereo);
});

test('PCM16 export clamps without modifying original samples', () => {
  const pcm = {sampleRate:48000,channels:[new Float32Array([-2,0,2])]};
  const encoded = encodePcmWav(pcm,'pcm16');
  const view = new DataView(encoded.buffer);
  assert.equal(view.getInt16(44,true),-32768);
  assert.equal(view.getInt16(48,true),32767);
  assert.equal(pcm.channels[0]![0],-2);
});

test('WAV bounds and unsupported formats are rejected', () => {
  const encoded = encodePcmWav({sampleRate:48000,channels:[new Float32Array([0,.5])]},'float32');
  assert.throws(() => decodePcmWav(encoded.slice(0,-1)));
  const bad = encoded.slice(); new DataView(bad.buffer).setUint16(20,7,true);
  assert.throws(() => decodePcmWav(bad),/format/i);
});

test('odd unknown chunks are skipped before sample decoding', () => {
  const base = encodePcmWav({sampleRate:44100,channels:[new Float32Array([.25,-.5])]},'float32');
  const bytes = new Uint8Array(base.length+10);
  bytes.set(base.slice(0,36)); bytes.set(new TextEncoder().encode('JUNK'),36);
  new DataView(bytes.buffer).setUint32(40,1,true); bytes[44]=7;
  bytes.set(base.slice(36),46); new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);
  assert.deepEqual([...decodePcmWav(bytes).channels[0]!],[.25,-.5]);
});
