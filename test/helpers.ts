/** Shared fixtures: note sequences and a rough plucked-string synthesiser. */

import type { NoteEvent } from '../src/types.ts';
import { midiToFrequency, nameToMidi } from '../src/music/notes.ts';

/** Build a take from note names, evenly spaced. */
export function seq(names: string[], stepMs = 400, confidence = 0.95): NoteEvent[] {
  return names.map((name, i) => ({
    midi: nameToMidi(name),
    startMs: i * stepMs,
    durationMs: stepMs - 70,
    confidence,
    velocity: 0.5,
  }));
}

/** Build a take from note names starting at an offset, for session timelines. */
export function seqAt(names: string[], startMs: number, stepMs = 400, confidence = 0.95): NoteEvent[] {
  return seq(names, stepMs, confidence).map((n) => ({ ...n, startMs: n.startMs + startMs }));
}

/** Harmonic amplitudes with a weak fundamental — the hard case for detection. */
export const PLUCK_HARMONICS = [0.35, 1.0, 0.65, 0.4, 0.22, 0.12];

export interface SynthNote {
  name: string;
  durationMs: number;
  gapMs: number;
}

/** Render notes to audio with attack, decay and a little room noise. */
export function synthesize(notes: SynthNote[], sampleRate = 44100, noise = 0.004): Float32Array {
  const totalMs = notes.reduce((t, n) => t + n.durationMs + n.gapMs, 0) + 300;
  const out = new Float32Array(Math.ceil((totalMs / 1000) * sampleRate));
  let cursor = 0;

  for (const note of notes) {
    const hz = midiToFrequency(nameToMidi(note.name));
    const count = Math.floor((note.durationMs / 1000) * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, t / 0.005) * Math.exp(-t / 0.45);
      let value = 0;
      for (let k = 0; k < PLUCK_HARMONICS.length; k++) {
        value += PLUCK_HARMONICS[k]! * Math.sin(2 * Math.PI * hz * (k + 1) * t);
      }
      out[cursor + i] = (out[cursor + i] ?? 0) + value * 0.22 * envelope;
    }
    cursor += count + Math.floor((note.gapMs / 1000) * sampleRate);
  }

  if (noise > 0) {
    // Deterministic pseudo-noise, so a failing test always fails the same way.
    let state = 12345;
    for (let i = 0; i < out.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      out[i] = out[i]! + ((state / 0x7fffffff) - 0.5) * noise;
    }
  }
  return out;
}

/** Convenience: same duration and gap for every note. */
export function pluck(names: string[], durationMs = 260, gapMs = 40): SynthNote[] {
  return names.map((name) => ({ name, durationMs, gapMs }));
}

// --- Spectra, for testing anything that reads a frequency domain ------------

/** In-place radix-2 FFT. Enough to build a realistic analyser spectrum. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

export interface StrumOptions {
  sampleRate?: number;
  fftSize?: number;
  /** Cents of detune between strings — nobody's guitar is perfectly in tune. */
  detuneCents?: number;
  /** Milliseconds between successive strings, as a pick crosses them. */
  spreadMs?: number;
  noise?: number;
}

/**
 * The dB spectrum an AnalyserNode would hand back for a strummed chord.
 *
 * Deliberately not idealised: real harmonic rolloff, string stiffness pushing
 * partials sharp, strings struck a few milliseconds apart, slight detuning,
 * a noise floor, and a Hann window that spreads every partial across bins.
 * A detector tested only against clean impulses at exact bin centres will
 * pass its tests and still fail on a guitar.
 */
export function strumSpectrum(midis: number[], options: StrumOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? 44100;
  const fftSize = options.fftSize ?? 8192;
  const detuneCents = options.detuneCents ?? 4;
  const spreadMs = options.spreadMs ?? 18;
  const noise = options.noise ?? 0.002;

  const buffer = new Float64Array(fftSize);
  const amps = [0.55, 1.0, 0.62, 0.4, 0.26, 0.17, 0.11, 0.07];

  midis.forEach((midi, stringIndex) => {
    const detune = (Math.sin(stringIndex * 12.9898) * detuneCents) / 1200;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12) * Math.pow(2, detune);
    const delay = Math.floor((stringIndex * spreadMs / 1000) * sampleRate);
    for (let i = delay; i < fftSize; i++) {
      const t = (i - delay) / sampleRate;
      const envelope = Math.exp(-t / 1.1);
      let value = 0;
      for (let k = 0; k < amps.length; k++) {
        const stiffness = 0.00008;
        const partial = f0 * (k + 1) * Math.sqrt(1 + stiffness * (k + 1) * (k + 1));
        if (partial < sampleRate / 2) value += amps[k]! * Math.sin(2 * Math.PI * partial * t + stringIndex);
      }
      buffer[i] = buffer[i]! + value * 0.11 * envelope;
    }
  });

  let state = 99;
  for (let i = 0; i < fftSize; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    buffer[i] = buffer[i]! + ((state / 0x7fffffff) - 0.5) * noise;
    buffer[i] = buffer[i]! * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftSize));
  }

  const imaginary = new Float64Array(fftSize);
  fftInPlace(buffer, imaginary);

  const out = new Float32Array(fftSize / 2);
  for (let i = 0; i < out.length; i++) {
    const magnitude = Math.sqrt(buffer[i]! * buffer[i]! + imaginary[i]! * imaginary[i]!) / (fftSize / 4);
    out[i] = 20 * Math.log10(Math.max(magnitude, 1e-9));
  }
  return out;
}

/** Open-position voicings as they are actually fretted, lowest string first. */
export const GUITAR_VOICINGS: Record<string, number[]> = {
  E: [40, 47, 52, 56, 59, 64],
  Em: [40, 47, 52, 55, 59, 64],
  E5: [40, 47, 52],
  A: [45, 52, 57, 61, 64],
  Am: [45, 52, 57, 60, 64],
  A7: [45, 52, 55, 61, 64],
  C: [48, 52, 55, 60, 64],
  D: [50, 57, 62, 66],
  Dm: [50, 57, 62, 65],
  G: [43, 47, 50, 55, 59, 67],
};
