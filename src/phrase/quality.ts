/**
 * "The third version was the cleanest."
 *
 * When several takes contain the same notes, something still makes one of them
 * the keeper. We approximate that with three measurable things: how sure the
 * detector was, how evenly the notes sat on their own pulse, and whether the
 * notes actually spoke rather than choking out.
 */

import type { NoteEvent, TakeQuality } from '../types.ts';
import { timingSteadiness } from '../music/rhythm.ts';

/** Below this a note was probably a fret buzz or a muted click, not a note. */
const MIN_SOUNDING_MS = 80;

export function takeQuality(notes: NoteEvent[]): TakeQuality {
  if (notes.length === 0) {
    return { score: 0, confidence: 0, timingSteadiness: 0, articulation: 0 };
  }
  const confidence = notes.reduce((s, n) => s + n.confidence, 0) / notes.length;
  const steadiness = timingSteadiness(notes);
  const spoke = notes.filter((n) => n.durationMs >= MIN_SOUNDING_MS && n.confidence >= 0.5).length;
  const articulation = spoke / notes.length;

  const score = 0.35 * confidence + 0.4 * steadiness + 0.25 * articulation;
  return { score, confidence, timingSteadiness: steadiness, articulation };
}

/** Index of the cleanest take. Ties go to the later one — players tend to improve. */
export function cleanestIndex(takes: NoteEvent[][]): number {
  let best = 0;
  let bestScore = -1;
  takes.forEach((take, i) => {
    const s = takeQuality(take).score;
    if (s >= bestScore) { bestScore = s; best = i; }
  });
  return best;
}
