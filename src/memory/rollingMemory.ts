/**
 * Ghost Capture: the app is always listening during a session, but never
 * hoarding.
 *
 * A fixed-length window of *structured pitch data* — not audio — rolls forward
 * as you play. Nothing is written anywhere until you ask for it. That is what
 * makes "wait, what did I just play?" answerable without turning a practice
 * session into a surveillance recording.
 */

import type { NoteEvent, Phrase } from '../types.ts';
import { segmentPhrases } from '../phrase/segment.ts';
import type { SegmentOptions } from '../phrase/segment.ts';

export interface RollingMemoryOptions {
  /** How far back the ghost buffer reaches. Default 60 seconds. */
  windowMs?: number;
  segment?: SegmentOptions;
}

export class RollingMemory {
  private events: NoteEvent[] = [];
  readonly windowMs: number;
  private readonly segmentOptions: SegmentOptions;
  /** Latest timestamp observed, so pruning works with or without a clock. */
  private nowMs = 0;

  constructor(options: RollingMemoryOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.segmentOptions = options.segment ?? {};
  }

  /** Record a note and drop anything that has aged out of the window. */
  push(note: NoteEvent): void {
    this.events.push(note);
    this.nowMs = Math.max(this.nowMs, note.startMs + note.durationMs);
    this.prune();
  }

  pushAll(notes: NoteEvent[]): void {
    for (const n of notes) this.push(n);
  }

  /**
   * Advance the clock without playing anything, so the buffer keeps ageing
   * during silence. Callers driving this from a real audio thread should call
   * it on every tick.
   */
  tick(nowMs: number): void {
    this.nowMs = Math.max(this.nowMs, nowMs);
    this.prune();
  }

  private prune(): void {
    const cutoff = this.nowMs - this.windowMs;
    if (this.events.length && this.events[0]!.startMs >= cutoff) return;
    this.events = this.events.filter((e) => e.startMs >= cutoff);
  }

  /** Everything still in the window, oldest first. */
  all(): NoteEvent[] {
    return [...this.events];
  }

  get size(): number {
    return this.events.length;
  }

  get currentTimeMs(): number {
    return this.nowMs;
  }

  /** The last `ms` of playing — the literal "rewind" behind Instant Recall. */
  lastMs(ms: number): NoteEvent[] {
    const cutoff = this.nowMs - ms;
    return this.events.filter((e) => e.startMs >= cutoff);
  }

  /** Musical ideas found in the recent past, oldest first. */
  recentPhrases(ms = this.windowMs): Phrase[] {
    return segmentPhrases(this.lastMs(ms), this.segmentOptions);
  }

  /**
   * The phrase the player most likely means by "what was that?" — the most
   * recent complete idea, not merely the last few notes.
   */
  lastPhrase(ms = 30_000): Phrase | null {
    const phrases = this.recentPhrases(ms);
    return phrases.length ? phrases[phrases.length - 1]! : null;
  }

  /** Forget everything. Offered so "clear my session" is one honest call. */
  clear(): void {
    this.events = [];
  }
}
