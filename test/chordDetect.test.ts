import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChord } from '../web/audio/chordDetect.ts';

const SR = 44100;
const FFT = 8192;

function spectrum(notes: number[]): Float32Array {
  const out = new Float32Array(FFT / 2).fill(-120);
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  for (const midi of notes) {
    const f = hz(midi);
    for (const [harmonic, db] of [[1,-28],[2,-35],[3,-42],[4,-49]] as const) {
      const bin = Math.round((f * harmonic) * FFT / SR);
      if (bin > 0 && bin < out.length) out[bin] = Math.max(out[bin]!, db);
    }
  }
  return out;
}

test('recognises a clean E minor guitar voicing', () => {
  const chord = detectChord(spectrum([40, 47, 52, 55, 59, 64]), SR, FFT);
  assert.ok(chord);
  assert.equal(chord.rootPc, 4);
  assert.match(chord.label, /^Em/);
});

test('does not invent a chord from one note', () => {
  assert.equal(detectChord(spectrum([40]), SR, FFT), null);
});
