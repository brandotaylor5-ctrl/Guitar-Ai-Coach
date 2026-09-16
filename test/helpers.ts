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
