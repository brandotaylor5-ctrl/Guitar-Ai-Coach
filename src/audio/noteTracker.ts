/**
 * Turning a continuous pitch stream into discrete notes.
 *
 * This is the boundary between signal and music. Everything upstream is
 * frames and hertz; everything downstream is `NoteEvent`s. Getting this wrong
 * poisons every feature above it, so the tracker is deliberately conservative:
 * it waits for a pitch to hold steady before believing in it, and it discards
 * notes too short to have been intentional.
 */

import type { NoteEvent } from '../types.ts';
import { frequencyToMidi } from '../music/notes.ts';
import type { PitchResult } from './pitchDetect.ts';

export interface Frame extends PitchResult {
  /** Time of this analysis window, in session milliseconds. */
  timeMs: number;
}

export interface NoteTrackerOptions {
  /** Frames below this clarity are treated as unvoiced. */
  minClarity?: number;
  /** Frames below this level are treated as silence. */
  minRms?: number;
  /** Consecutive frames a new pitch must hold before it replaces the current note. */
  stabilityFrames?: number;
  /** Notes shorter than this are dropped as fret noise. */
  minDurationMs?: number;
  /** Unvoiced time before the current note is released. */
  releaseMs?: number;
  /** A level jump this many times above the running level re-articulates a note. */
  reonsetFactor?: number;
  /** Median filter width over recent pitch, to absorb single-frame octave slips. */
  smoothingFrames?: number;
}

const DEFAULTS: Required<NoteTrackerOptions> = {
  minClarity: 0.75,
  minRms: 0.012,
  stabilityFrames: 3,
  minDurationMs: 60,
  releaseMs: 120,
  reonsetFactor: 2.2,
  smoothingFrames: 5,
};

interface ActiveNote {
  midi: number;
  startMs: number;
  lastVoicedMs: number;
  clarities: number[];
  peakRms: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export class NoteTracker {
  private readonly o: Required<NoteTrackerOptions>;
  private recentMidi: number[] = [];
  private active: ActiveNote | null = null;
  private pendingMidi: number | null = null;
  private pendingFrames = 0;
  private runningRms = 0;

  constructor(options: NoteTrackerOptions = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  /** Feed one analysis frame. Returns any notes that completed on this frame. */
  process(frame: Frame): NoteEvent[] {
    const emitted: NoteEvent[] = [];
    const voiced = frame.hz > 0 && frame.clarity >= this.o.minClarity && frame.rms >= this.o.minRms;

    if (!voiced) {
      this.recentMidi = [];
      this.pendingMidi = null;
      this.pendingFrames = 0;
      if (this.active && frame.timeMs - this.active.lastVoicedMs >= this.o.releaseMs) {
        const done = this.close(this.active.lastVoicedMs);
        if (done) emitted.push(done);
      }
      this.runningRms = this.runningRms * 0.85 + frame.rms * 0.15;
      return emitted;
    }

    this.recentMidi.push(frequencyToMidi(frame.hz));
    if (this.recentMidi.length > this.o.smoothingFrames) this.recentMidi.shift();
    const midi = Math.round(median(this.recentMidi));

    // A sharp rise in level on the same pitch means the string was struck
    // again — two eighth notes on one fret, not one note held twice as long.
    const struckAgain =
      this.active !== null &&
      this.active.midi === midi &&
      this.runningRms > 0 &&
      frame.rms > this.runningRms * this.o.reonsetFactor &&
      frame.timeMs - this.active.startMs >= this.o.minDurationMs;

    if (struckAgain) {
      const done = this.close(frame.timeMs);
      if (done) emitted.push(done);
      this.open(midi, frame);
    } else if (this.active === null) {
      this.open(midi, frame);
    } else if (this.active.midi === midi) {
      this.pendingMidi = null;
      this.pendingFrames = 0;
      this.active.lastVoicedMs = frame.timeMs;
      this.active.clarities.push(frame.clarity);
      this.active.peakRms = Math.max(this.active.peakRms, frame.rms);
    } else {
      // A different pitch must hold before we believe it, so bends, slides and
      // single bad frames do not shatter a held note into fragments.
      if (this.pendingMidi === midi) this.pendingFrames++;
      else { this.pendingMidi = midi; this.pendingFrames = 1; }

      if (this.pendingFrames >= this.o.stabilityFrames) {
        const done = this.close(frame.timeMs);
        if (done) emitted.push(done);
        this.open(midi, frame);
      } else {
        this.active.lastVoicedMs = frame.timeMs;
      }
    }

    this.runningRms = this.runningRms * 0.85 + frame.rms * 0.15;
    return emitted;
  }

  private open(midi: number, frame: Frame): void {
    this.active = {
      midi,
      startMs: frame.timeMs,
      lastVoicedMs: frame.timeMs,
      clarities: [frame.clarity],
      peakRms: frame.rms,
    };
    this.pendingMidi = null;
    this.pendingFrames = 0;
  }

  private close(endMs: number): NoteEvent | null {
    const note = this.active;
    this.active = null;
    if (!note) return null;
    const durationMs = Math.max(0, endMs - note.startMs);
    if (durationMs < this.o.minDurationMs) return null;
    const confidence = note.clarities.reduce((a, b) => a + b, 0) / note.clarities.length;
    return {
      midi: note.midi,
      startMs: note.startMs,
      durationMs,
      confidence: Math.max(0, Math.min(1, confidence)),
      velocity: Math.max(0, Math.min(1, note.peakRms)),
    };
  }

  /** Close out whatever is still ringing. Call when the session stops. */
  flush(endMs?: number): NoteEvent[] {
    const note = this.active;
    if (!note) return [];
    const done = this.close(endMs ?? note.lastVoicedMs);
    return done ? [done] : [];
  }

  reset(): void {
    this.active = null;
    this.recentMidi = [];
    this.pendingMidi = null;
    this.pendingFrames = 0;
    this.runningRms = 0;
  }
}
