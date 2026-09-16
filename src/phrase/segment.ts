/**
 * Carving a stream of notes into musical ideas.
 *
 * A 45-minute session is not one enormous melody. Players breathe: they pause
 * between attempts, and those pauses are the strongest available signal of
 * where one idea ends and the next begins. The rest threshold adapts to how
 * fast the player is actually playing, so slow rubato playing is not shredded
 * into fragments and fast runs are not glued into one blob.
 */

import type { NoteEvent, Phrase } from '../types.ts';
import { makeId } from '../util/id.ts';

export interface SegmentOptions {
  /** A gap shorter than this is never a boundary, however slowly you play. */
  minRestMs?: number;
  /** A gap longer than this is always a boundary. */
  maxRestMs?: number;
  /** A gap this many times the typical gap counts as a breath. */
  restFactor?: number;
  /** Fragments shorter than this are not offered as phrases. */
  minNotes?: number;
  /** Force a boundary rather than letting one phrase run forever. */
  maxNotes?: number;
  maxDurationMs?: number;
}

const DEFAULTS: Required<SegmentOptions> = {
  minRestMs: 400,
  maxRestMs: 2500,
  restFactor: 2.2,
  minNotes: 3,
  maxNotes: 32,
  maxDurationMs: 15000,
};

/** Silence between the end of one note and the start of the next. */
export function restsBetween(notes: NoteEvent[]): number[] {
  const rests: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1]!;
    rests.push(Math.max(0, notes[i]!.startMs - (prev.startMs + prev.durationMs)));
  }
  return rests;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The rest length that counts as a breath for this particular playing.
 *
 * The median runs over *every* gap, zeros included. Counting only the non-zero
 * ones sounds tidier but is backwards: a player running notes together leaves
 * near-zero gaps inside a phrase and long ones between phrases, so dropping the
 * zeros makes the median describe the pauses themselves — and the threshold
 * then lands above the very gaps it is supposed to split on.
 */
export function restThreshold(notes: NoteEvent[], options: SegmentOptions = {}): number {
  const o = { ...DEFAULTS, ...options };
  const adaptive = median(restsBetween(notes)) * o.restFactor;
  return Math.min(o.maxRestMs, Math.max(o.minRestMs, adaptive));
}

function toPhrase(notes: NoteEvent[]): Phrase {
  const first = notes[0]!;
  const last = notes[notes.length - 1]!;
  return {
    id: makeId('phr'),
    notes,
    startMs: first.startMs,
    endMs: last.startMs + last.durationMs,
  };
}

/**
 * Split into phrases. Fragments below `minNotes` are dropped: a single stray
 * note is not a musical idea, and offering it as one is noise.
 */
export function segmentPhrases(notes: NoteEvent[], options: SegmentOptions = {}): Phrase[] {
  const o = { ...DEFAULTS, ...options };
  if (notes.length === 0) return [];

  const ordered = [...notes].sort((a, b) => a.startMs - b.startMs);
  const threshold = restThreshold(ordered, options);
  const rests = restsBetween(ordered);

  const phrases: Phrase[] = [];
  let current: NoteEvent[] = [ordered[0]!];

  for (let i = 1; i < ordered.length; i++) {
    const note = ordered[i]!;
    const spanMs = note.startMs - current[0]!.startMs;
    const boundary =
      rests[i - 1]! > threshold || current.length >= o.maxNotes || spanMs > o.maxDurationMs;
    if (boundary) {
      phrases.push(toPhrase(current));
      current = [note];
    } else {
      current.push(note);
    }
  }
  phrases.push(toPhrase(current));

  return phrases.filter((p) => p.notes.length >= o.minNotes);
}
