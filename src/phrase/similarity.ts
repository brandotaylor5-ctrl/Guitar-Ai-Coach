/**
 * "You played something very similar to this four times."
 *
 * Musical sameness is not string equality. A riff played three frets higher, or
 * a little faster, or with one note changed, is still the same idea — so we
 * compare interval shape, rhythmic shape and melodic contour, all of which are
 * invariant to the things a player changes without meaning to.
 */

import type { NoteEvent, Phrase } from '../types.ts';
import { contourOf, intervalsOf } from '../music/notes.ts';
import { rhythmShape } from '../music/rhythm.ts';
import { align } from './align.ts';

export interface SimilarityBreakdown {
  /** 0..1 overall. */
  overall: number;
  /** Interval shape — the melody, independent of what key it was played in. */
  interval: number;
  /** Rhythmic shape, independent of tempo. */
  rhythm: number;
  /** Up/down/same shape only — the coarsest sense of "the same line". */
  contour: number;
  /** 1 when both takes are in the same key; lower when transposed. */
  pitchLevel: number;
}

export const SIMILARITY_WEIGHTS = { interval: 0.55, rhythm: 0.25, contour: 0.2 };

/** A semitone or two apart is a near-miss; a fifth apart is a different note. */
function intervalCost(a: number, b: number): number {
  return Math.min(1, Math.abs(a - b) / 4);
}

/** Compared in log space, so "twice as long" is the same error either way round. */
function ratioCost(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 1;
  return Math.min(1, Math.abs(Math.log2(a / b)) / 1.5);
}

export function midisOf(notes: NoteEvent[]): number[] {
  return notes.map((n) => n.midi);
}

/** Melodic similarity that ignores what key the idea was played in. */
export function intervalSimilarity(a: NoteEvent[], b: NoteEvent[]): number {
  const ia = intervalsOf(midisOf(a));
  const ib = intervalsOf(midisOf(b));
  if (ia.length === 0 && ib.length === 0) return 1;
  return align(ia, ib, { substitutionCost: intervalCost, matchThreshold: 0.01 }).similarity;
}

export function rhythmSimilarity(a: NoteEvent[], b: NoteEvent[]): number {
  const ra = rhythmShape(a);
  const rb = rhythmShape(b);
  if (ra.length === 0 && rb.length === 0) return 1;
  return align(ra, rb, { substitutionCost: ratioCost, matchThreshold: 0.05 }).similarity;
}

export function contourSimilarity(a: NoteEvent[], b: NoteEvent[]): number {
  const ca = contourOf(midisOf(a));
  const cb = contourOf(midisOf(b));
  if (ca.length === 0 && cb.length === 0) return 1;
  return align(ca, cb, { substitutionCost: (x, y) => (x === y ? 0 : 1) }).similarity;
}

/** 1 if the two takes sit in the same register and key, decaying with transposition. */
export function pitchLevelSimilarity(a: NoteEvent[], b: NoteEvent[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const mean = (ns: NoteEvent[]) => ns.reduce((s, n) => s + n.midi, 0) / ns.length;
  return Math.max(0, 1 - Math.abs(mean(a) - mean(b)) / 12);
}

export function compareNotes(a: NoteEvent[], b: NoteEvent[]): SimilarityBreakdown {
  const interval = intervalSimilarity(a, b);
  const rhythm = rhythmSimilarity(a, b);
  const contour = contourSimilarity(a, b);
  const pitchLevel = pitchLevelSimilarity(a, b);
  const overall =
    interval * SIMILARITY_WEIGHTS.interval +
    rhythm * SIMILARITY_WEIGHTS.rhythm +
    contour * SIMILARITY_WEIGHTS.contour;
  return { overall, interval, rhythm, contour, pitchLevel };
}

export function comparePhrases(a: Phrase, b: Phrase): SimilarityBreakdown {
  return compareNotes(a.notes, b.notes);
}

/** Shorthand for the 0..1 number, when the breakdown is not needed. */
export function similarity(a: NoteEvent[], b: NoteEvent[]): number {
  return compareNotes(a, b).overall;
}
