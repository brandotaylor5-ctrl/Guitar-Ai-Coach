/**
 * Playing a riff back.
 *
 * Playback needs to be musical enough to judge an idea, not merely prove that
 * the pitches are correct. Notes therefore use a small Karplus-Strong style
 * plucked-string model: a noisy string excitation feeds a damped delay loop,
 * then a little body filtering. It is still synthesis — never presented as a
 * recording of the player's guitar — but it behaves much more like a string
 * than the old stack of sine waves.
 */

import type { NoteEvent } from '../../src/types.ts';
import { midiToFrequency } from '../../src/music/notes.ts';
import { timeStretch } from '../../src/audio/timeStretch.ts';
import { audioContext, audioOutput, unlockAudio } from './context.ts';

/** Deterministic noise keeps the same pitch from changing character every play. */
function seededNoise(seed:number):()=>number {
  let state=(seed>>>0)||1;
  return ()=>{
    state=(state*1664525+1013904223)>>>0;
    return (state/0xffffffff)*2-1;
  };
}

function pluckBuffer(
  context:AudioContext,
  frequency:number,
  seconds:number,
):AudioBuffer {
  const sampleRate=context.sampleRate;
  const length=Math.max(1,Math.ceil(seconds*sampleRate));
  const period=Math.max(2,Math.round(sampleRate/frequency));
  const ring=new Float32Array(period);
  const random=seededNoise(Math.round(frequency*1000)+length);

  // Pick excitation: broad-band at first, slightly softened so the attack
  // feels like finger/pick on a string rather than white-noise static.
  let previous=0;
  for(let i=0;i<period;i++){
    const noise=random();
    ring[i]=noise*.74+previous*.26;
    previous=ring[i]!;
  }

  // Lower strings lose high-frequency energy more slowly than high strings.
  const normalized=Math.max(0,Math.min(1,(frequency-82)/(880-82)));
  const damping=.996-normalized*.0045;
  const buffer=context.createBuffer(1,length,sampleRate);
  const out=buffer.getChannelData(0);
  let smooth=0;

  for(let i=0;i<length;i++){
    const index=i%period;
    const next=(index+1)%period;
    const value=ring[index]!;
    const averaged=(value+ring[next]!)*.5*damping;
    ring[index]=averaged;

    // A tiny output smoothing stage removes the brittle digital edge while
    // retaining the initial pick transient.
    smooth=value*.88+smooth*.12;
    const life=Math.exp(-2.8*i/length);
    const attack=Math.min(1,i/(sampleRate*.0025));
    out[i]=smooth*life*attack;
  }
  return buffer;
}

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
    const velocity = 0.28 + (note.velocity ?? 0.5) * 0.5;
    const sustain = Math.max(0.45, Math.min(3.1, duration + 0.7));

    const source = context.createBufferSource();
    source.buffer = pluckBuffer(context, frequency, sustain);

    // Guitar body / air: lose sub rumble and the scratchiest top end, then add
    // a broad little wooden-body bump. Native filters keep this cheap on phone.
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 65;
    highpass.Q.value = 0.35;

    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = frequency < 180 ? 145 : 215;
    body.Q.value = 0.8;
    body.gain.value = 2.4;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.max(2600, Math.min(6200, frequency * 16));
    lowpass.Q.value = 0.45;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(velocity, at + 0.004);
    gain.gain.setValueAtTime(velocity * 0.92, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + sustain);

    source.connect(highpass);
    highpass.connect(body);
    body.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(destination);

    source.start(at);
    source.stop(at + sustain + 0.05);
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
