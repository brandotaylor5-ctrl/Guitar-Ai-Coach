/**
 * Playing a riff back.
 *
 * A plucked string is mostly a handful of decaying partials, so additive
 * synthesis gets close enough to recognise your own idea — which is the only
 * job here. It is not trying to sound like your guitar; it is trying to let you
 * hear the shape of what you played.
 */

import type { NoteEvent } from '../../src/types.ts';
import { midiToFrequency } from '../../src/music/notes.ts';
import { timeStretch } from '../../src/audio/timeStretch.ts';
import { audioContext, audioOutput, unlockAudio } from './context.ts';

/** Relative amplitude of each partial, and how fast each one dies away. */
const PARTIALS = [
  { harmonic: 1, gain: 0.55, decay: 1.0 },
  { harmonic: 2, gain: 0.30, decay: 0.7 },
  { harmonic: 3, gain: 0.16, decay: 0.5 },
  { harmonic: 4, gain: 0.09, decay: 0.38 },
  { harmonic: 5, gain: 0.05, decay: 0.3 },
];

export interface PlayOptions {
  /** 1 is the original speed; 0.5 is half speed. Pitch is unaffected. */
  speed?: number;
  /** Called as each note starts, for highlighting along with the playback. */
  onNote?: (index: number) => void;
  /** Called once playback finishes or is stopped. */
  onEnd?: () => void;
}

/**
 * The most notes sounding at once — a strum counts as one chord, not six
 * separate events. Notes within a strum window are treated as simultaneous
 * because that is how they are heard.
 */
function maxSimultaneous(notes: NoteEvent[]): number {
  const STRUM_MS = 60;
  const starts = notes.map((n) => n.startMs).sort((a, b) => a - b);
  let most = 1;
  let from = 0;
  for (let i = 0; i < starts.length; i += 1) {
    while (starts[i]! - starts[from]! > STRUM_MS) from += 1;
    most = Math.max(most, i - from + 1);
  }
  return most;
}

export class RiffPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: number[] = [];
  private endTimer: number | null = null;
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  private ensureContext(): AudioContext {
    // Shared, so playback, the metronome and anything else all run through one
    // context. Browsers cap how many a page may hold, and a page that quietly
    // runs out simply stops making sound.
    if (!this.context) this.context = audioContext();
    return this.context;
  }

  /** Schedule the whole riff up front, so timing does not depend on the UI. */
  async play(notes: NoteEvent[], options: PlayOptions = {}): Promise<void> {
    this.stop();
    if (notes.length === 0) return;

    const speed = options.speed ?? 1;
    const context = this.ensureContext();
    if (context.state !== 'running') await unlockAudio();

    const master = context.createGain();
    // A six-string chord is six voices summed. Holding every chord to the
    // level of a single note would make chords disappear, so this backs off
    // by the square root of the voice count: loud enough to feel like a
    // strum, quiet enough that the limiter is barely working.
    master.gain.value = 0.9 / Math.sqrt(maxSimultaneous(notes));
    master.connect(audioOutput());
    this.master = master;
    this.playing = true;

    const origin = notes[0]!.startMs;
    const startAt = context.currentTime + 0.08;
    let finishesAt = 0;

    notes.forEach((note, index) => {
      // Notes handed in from several riffs may not be in ascending time order;
      // a negative offset would schedule in the past and throw.
      const offset = Math.max(0, ((note.startMs - origin) / 1000) / speed);
      const duration = Math.max(0.12, (note.durationMs / 1000) / speed);
      this.scheduleNote(context, master, note, startAt + offset, duration);
      finishesAt = Math.max(finishesAt, offset + duration);

      if (options.onNote) {
        this.timers.push(window.setTimeout(() => options.onNote?.(index), offset * 1000 + 80));
      }
    });

    await new Promise<void>((resolve) => {
      this.endTimer = window.setTimeout(() => {
        this.playing = false;
        options.onEnd?.();
        resolve();
      }, (finishesAt + 0.4) * 1000);
    });
  }

  private scheduleNote(
    context: AudioContext,
    destination: GainNode,
    note: NoteEvent,
    at: number,
    duration: number,
  ): void {
    const frequency = midiToFrequency(note.midi);
    const velocity = 0.35 + (note.velocity ?? 0.5) * 0.4;

    for (const partial of PARTIALS) {
      const hz = frequency * partial.harmonic;
      // Anything above the top of hearing is wasted work and can alias.
      if (hz > context.sampleRate / 2.2) continue;

      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;

      const gain = context.createGain();
      const peak = partial.gain * velocity;
      // A pluck: near-instant attack, then an exponential decay whose length
      // depends on the partial. Higher partials die first, as on a real string.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration * partial.decay + 0.15);

      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(at);
      oscillator.stop(at + duration * partial.decay + 0.25);
    }
  }

  /**
   * Play recorded audio, optionally slowed. Slowing uses time-stretching
   * rather than a lower sample rate, so the pitch stays where the player
   * left it — the whole point of practising something slowly.
   */
  async playSamples(samples: Float32Array, sampleRate: number, speed = 1): Promise<void> {
    this.stop();
    if (samples.length === 0) return;

    const context = this.ensureContext();
    if (context.state !== 'running') await unlockAudio();

    const audio = speed === 1 ? samples : timeStretch(samples, 1 / speed);
    const buffer = context.createBuffer(1, audio.length, sampleRate);
    buffer.copyToChannel(audio instanceof Float32Array ? audio : new Float32Array(audio), 0);

    const master = context.createGain();
    master.gain.value = 1;
    master.connect(audioOutput());
    this.master = master;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    this.playing = true;
    source.start();

    await new Promise<void>((resolve) => {
      source.onended = () => { this.playing = false; resolve(); };
    });
  }

  /** Play a single note, for auditioning one change. */
  async playNote(midi: number, durationMs = 600): Promise<void> {
    await this.play([{ midi, startMs: 0, durationMs, confidence: 1, velocity: 0.6 }]);
  }

  stop(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    if (this.endTimer !== null) window.clearTimeout(this.endTimer);
    this.endTimer = null;

    if (this.master && this.context) {
      // Ramp down rather than cutting, which would click.
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      const dying = this.master;
      window.setTimeout(() => dying.disconnect(), 200);
      this.master = null;
    }
    this.playing = false;
  }
}
