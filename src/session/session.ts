/**
 * The musician sitting across from you.
 *
 * A session listens continuously, keeps a rolling memory of what was played,
 * and can answer the one question this whole product exists to answer:
 * "wait — what did I just play?"
 *
 * Nothing here writes anything down. Persisting an idea is always an explicit
 * act by the player, which is what keeps continuous listening acceptable.
 */

import type {
  MotifGroup, NoteEvent, Phrase, PhraseAnalysis, RecognitionMatch, Riff,
} from '../types.ts';
import { RollingMemory } from '../memory/rollingMemory.ts';
import { restThreshold } from '../phrase/segment.ts';
import { AudioRingBuffer } from '../memory/audioRing.ts';
import { NoteTracker } from '../audio/noteTracker.ts';
import type { Frame } from '../audio/noteTracker.ts';
import { FrameStreamer } from '../audio/stream.ts';
import { analyzePhrase } from '../phrase/analyze.ts';
import { groupMotifs, motifContaining } from '../phrase/motif.ts';
import { diffTakes } from '../phrase/diff.ts';
import type { TakeDiff } from '../phrase/diff.ts';
import { describeNotes } from '../explain/explain.ts';
import { RiffLibrary } from '../library/riffLibrary.ts';
import type { SaveRiffOptions } from '../library/riffLibrary.ts';
import type { Tuning } from '../music/fretboard.ts';
import { STANDARD_TUNING } from '../music/fretboard.ts';

export interface SessionOptions {
  library?: RiffLibrary;
  tuning?: Tuning;
  /** How far back the ghost buffer reaches. Default 60s. */
  memoryWindowMs?: number;
  /** Provide to accept raw audio and to keep recent sound for saving. */
  audio?: {
    sampleRate: number;
    windowSize?: number;
    hopSize?: number;
    /** Keep recent audio so a saved riff can carry its recording. */
    retainAudio?: boolean;
    /**
     * Whether this session runs pitch detection itself. Set false when
     * detection happens off the main thread — in a Web Worker, say — and the
     * notes arrive through `addNotes` instead. `feedAudio` then only keeps
     * audio for saving, which is cheap enough to do while the UI renders.
     */
    detect?: boolean;
  };
}

/** One take of an idea, with everything the app worked out about it. */
export interface RecallTake {
  phrase: Phrase;
  analysis: PhraseAnalysis;
  /** How this take differs from the first one. Null for the first take. */
  diffFromFirst: TakeDiff | null;
  isCleanest: boolean;
  secondsAgo: number;
}

/** The answer to "what was that thing I just played?" */
export interface Recall {
  phrase: Phrase;
  analysis: PhraseAnalysis;
  secondsAgo: number;
  /** Every take of this idea in the session, oldest first. */
  takes: RecallTake[];
  motif: MotifGroup | null;
  cleanest: Phrase;
  /** Older saved riffs this resembles. */
  matches: RecognitionMatch[];
  /** What the app would say out loud, written the way a person would say it. */
  say: string;
}

function secondsBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / 1000));
}

/** "about 12 seconds ago", but without the "1 seconds" problem. */
export function describeAgo(seconds: number): string {
  return seconds <= 1 ? 'a moment ago' : `about ${seconds} seconds ago`;
}

function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n] ?? `${n + 1}th`;
}

function countWord(n: number): string {
  return ['no', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times'][n] ?? `${n} times`;
}

export class SketchbookSession {
  readonly memory: RollingMemory;
  readonly library: RiffLibrary;
  readonly tuning: Tuning;
  readonly audioRing: AudioRingBuffer | null;
  private readonly audioSampleRate: number;
  private readonly tracker: NoteTracker;
  private readonly streamer: FrameStreamer | null;
  private retainedMs = 0;
  private listeners: Array<(note: NoteEvent) => void> = [];
  /** Clips the player chose to keep, by `audioRef`. Nothing else is retained. */
  readonly savedClips = new Map<string, Float32Array>();

  constructor(options: SessionOptions = {}) {
    this.memory = new RollingMemory({ windowMs: options.memoryWindowMs ?? 60_000 });
    this.library = options.library ?? new RiffLibrary();
    this.tuning = options.tuning ?? STANDARD_TUNING;
    this.tracker = new NoteTracker();
    const detects = options.audio ? options.audio.detect !== false : false;
    this.streamer = options.audio && detects ? new FrameStreamer(options.audio) : null;
    this.audioSampleRate = options.audio?.sampleRate ?? 0;
    this.audioRing = options.audio?.retainAudio
      ? new AudioRingBuffer({ sampleRate: options.audio.sampleRate, windowMs: options.memoryWindowMs ?? 60_000 })
      : null;
  }

  /** Called for every note the session hears. For live display. */
  onNote(listener: (note: NoteEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(notes: NoteEvent[]): NoteEvent[] {
    for (const note of notes) {
      this.memory.push(note);
      for (const listener of this.listeners) listener(note);
    }
    return notes;
  }

  /** Feed notes directly, when pitch detection happens elsewhere (or in tests). */
  addNotes(notes: NoteEvent[]): void {
    this.emit(notes);
  }

  /** Feed one analysis frame. Returns any notes that completed. */
  feedFrame(frame: Frame): NoteEvent[] {
    this.memory.tick(frame.timeMs);
    return this.emit(this.tracker.process(frame));
  }

  /**
   * Feed raw audio. Requires `audio` options. Returns the notes that completed
   * on this chunk, or nothing when detection is running elsewhere.
   */
  feedAudio(chunk: Float32Array): NoteEvent[] {
    if (!this.audioSampleRate) throw new Error('Session was not constructed with audio options');
    if (this.audioRing) this.audioRing.write(chunk);
    this.retainedMs += (chunk.length / this.audioSampleRate) * 1000;
    if (!this.streamer) return [];
    const completed: NoteEvent[] = [];
    for (const frame of this.streamer.push(chunk)) completed.push(...this.feedFrame(frame));
    return completed;
  }

  /** Close out anything still ringing. Call when the player stops. */
  flush(): NoteEvent[] {
    return this.emit(this.tracker.flush(this.memory.currentTimeMs));
  }

  get currentTimeMs(): number {
    return Math.max(this.memory.currentTimeMs, this.streamer?.currentTimeMs ?? 0, this.retainedMs);
  }

  // --- Asking -------------------------------------------------------------

  /** Musical ideas still inside the rolling window. */
  phrases(): Phrase[] {
    return this.memory.recentPhrases();
  }

  motifs(): MotifGroup[] {
    return groupMotifs(this.phrases());
  }

  /** Instant Recall: the structured pitch data for the last `seconds`. */
  ghostCapture(seconds = 20): NoteEvent[] {
    return this.memory.lastMs(seconds * 1000);
  }

  /**
   * "What was that thing I just played?"
   *
   * Finds the most recent complete idea, then looks back through the session
   * for every other time the player touched it — which is what turns a stream
   * of notes into something worth having a conversation about.
   */
  async whatDidIJustPlay(): Promise<Recall | null> {
    const phrases = this.phrases();
    const phrase = this.lastSettledPhrase(phrases);
    return phrase ? this.buildRecall(phrase, phrases) : null;
  }

  /**
   * The last idea the player actually *finished*.
   *
   * Asking this question while still playing used to hand back whatever notes
   * had arrived so far — a three-note fragment of a riff still in progress.
   * A phrase counts as finished once a breath's worth of silence has followed
   * it, using the same threshold that decided where the phrase ended. If
   * nothing has settled yet, the most recent phrase is still the best answer.
   */
  private lastSettledPhrase(phrases: Phrase[]): Phrase | undefined {
    if (phrases.length === 0) return undefined;
    const breathMs = restThreshold(this.memory.all());
    const now = this.currentTimeMs;
    for (let i = phrases.length - 1; i >= 0; i--) {
      if (now - phrases[i]!.endMs >= breathMs) return phrases[i];
    }
    return phrases[phrases.length - 1];
  }

  /**
   * The same question asked about an older idea — for when the player points at
   * something further back rather than meaning the last thing they played.
   */
  async recallPhrase(phraseId: string): Promise<Recall | null> {
    const phrases = this.phrases();
    const phrase = phrases.find((p) => p.id === phraseId);
    return phrase ? this.buildRecall(phrase, phrases) : null;
  }

  private async buildRecall(phrase: Phrase, phrases: Phrase[]): Promise<Recall> {
    const now = this.currentTimeMs;
    const motif = motifContaining(groupMotifs(phrases), phrase.id);
    const takePhrases = motif ? motif.takes : [phrase];
    const first = takePhrases[0]!;

    const takes: RecallTake[] = takePhrases.map((take, i) => ({
      phrase: take,
      analysis: analyzePhrase(take, { tuning: this.tuning }),
      diffFromFirst: i === 0 ? null : diffTakes(first.notes, take.notes),
      isCleanest: motif ? take.id === motif.cleanest.id : true,
      secondsAgo: secondsBetween(take.startMs, now),
    }));

    const analysis = analyzePhrase(phrase, { tuning: this.tuning });
    const matches = await this.library.findSimilar(phrase.notes);

    return {
      phrase,
      analysis,
      secondsAgo: secondsBetween(phrase.startMs, now),
      takes,
      motif,
      cleanest: motif ? motif.cleanest : phrase,
      matches,
      say: this.narrateRecall(takes, matches),
    };
  }

  /** The spoken answer. Plain language, note names the player will recognise. */
  private narrateRecall(takes: RecallTake[], matches: RecognitionMatch[]): string {
    const first = takes[0]!;
    const lines: string[] = [];

    lines.push(`I think you mean this phrase from ${describeAgo(first.secondsAgo)}:`);
    lines.push('');
    lines.push(`  ${describeNotes(first.phrase.notes)}`);
    lines.push('');

    if (takes.length > 1) {
      lines.push(`You played a variation of it ${countWord(takes.length)}.`);
      for (let i = 1; i < takes.length; i++) {
        const take = takes[i]!;
        lines.push('');
        lines.push(`The ${ordinalWord(i)} version was:`);
        lines.push(`  ${describeNotes(take.phrase.notes)}`);
        if (take.diffFromFirst && !take.diffFromFirst.identical) {
          lines.push(`  (${take.diffFromFirst.summary})`);
        }
      }
      const cleanestIdx = takes.findIndex((t) => t.isCleanest);
      if (cleanestIdx >= 0) {
        lines.push('');
        lines.push(`The ${ordinalWord(cleanestIdx)} version was the cleanest.`);
      }
    }

    if (matches.length > 0) {
      const match = matches[0]!;
      const days = Math.round((Date.now() - match.createdAt) / 86_400_000);
      const when = days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `about ${days} days ago`;
      lines.push('');
      lines.push(`This is very close to ${match.riffName ?? 'a riff you saved'} from ${when}.`);
    }

    lines.push('');
    lines.push('Do you want to save one of them as a riff?');
    return lines.join('\n');
  }

  // --- Saving -------------------------------------------------------------

  /**
   * SAVE RIFF. The only point at which anything leaves the rolling buffer.
   * If audio is being retained, the clip for exactly this phrase comes with it.
   */
  async saveRiff(phrase: Phrase, options: SaveRiffOptions = {}): Promise<Riff> {
    const audioRef = this.extractAudioRef(phrase);
    return this.library.saveRiff(phrase.notes, { ...options, ...(audioRef ? { audioRef } : {}) });
  }

  /** Save the most recent idea without naming it first. Naming can wait. */
  async saveLastPhrase(options: SaveRiffOptions = {}): Promise<Riff | null> {
    const phrase = this.memory.lastPhrase();
    return phrase ? this.saveRiff(phrase, options) : null;
  }

  /** Add this take to an existing riff as a new version rather than a new riff. */
  async saveAsVersion(riffId: string, phrase: Phrase, comment?: string) {
    const audioRef = this.extractAudioRef(phrase);
    return this.library.addVersion(riffId, phrase.notes, {
      ...(comment ? { comment } : {}),
      ...(audioRef ? { audioRef } : {}),
    });
  }

  /**
   * Pull this phrase's audio out of the ring buffer. Returns null when audio
   * is not being retained — the default, and the privacy-preserving one.
   */
  private extractAudioRef(phrase: Phrase): string | null {
    if (!this.audioRing) return null;
    const clip = this.audioRing.extract(phrase.startMs - 150, phrase.endMs + 400);
    if (clip.length === 0) return null;
    this.savedClips.set(phrase.id, clip);
    return `clip:${phrase.id}`;
  }

  getClip(audioRef: string): Float32Array | null {
    return this.savedClips.get(audioRef.replace(/^clip:/, '')) ?? null;
  }

  /** Forget the session. Pitch memory and any retained audio both go. */
  clear(): void {
    this.memory.clear();
    this.tracker.reset();
    this.streamer?.reset();
    this.audioRing?.clear();
    this.retainedMs = 0;
  }
}
