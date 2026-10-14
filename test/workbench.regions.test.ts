import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePcm, validateRegion, slicePcm, waveformPeaks } from '../src/workbench/regions.ts';

test('region boundaries preserve the source', () => {
  const pcm = {sampleRate:44100, channels:[Float32Array.from({length:20}, (_, i) => i / 20)]};
  const before = pcm.channels[0]!.slice();
  const cut = slicePcm(pcm, {assetId:'a', startSample:7, endSample:14});
  assert.equal(cut.channels[0]!.length, 7);
  assert.equal(cut.channels[0]![0], Math.fround(.35));
  cut.channels[0]![0] = 0;
  assert.deepEqual(pcm.channels[0], before);
  for (const [startSample,endSample] of [[3,3],[-1,4],[3,21],[1.5,4]]) {
    assert.throws(() => validateRegion({assetId:'a',startSample:startSample!,endSample:endSample!},20));
  }
});

test('invalid PCM is rejected before persistence or encoding', () => {
  assert.throws(() => validatePcm({sampleRate:48000,channels:[new Float32Array([NaN])]}));
  assert.throws(() => validatePcm({sampleRate:48000,channels:[new Float32Array(3),new Float32Array(2)]}));
  assert.throws(() => validatePcm({sampleRate:0,channels:[new Float32Array(2)]}));
  assert.throws(() => validatePcm({sampleRate:48000,channels:[]}));
});

test('waveform peaks include both channels and the last sample', () => {
  const peaks = waveformPeaks({sampleRate:10,channels:[new Float32Array([.5,-.5,0,0]),new Float32Array([0,0,.25,-1])]},2);
  assert.deepEqual(peaks,[{min:-.5,max:.5},{min:-1,max:.25}]);
});
