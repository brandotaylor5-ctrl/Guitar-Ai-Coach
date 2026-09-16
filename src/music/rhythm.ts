/**
 * Tempo and rhythmic shape, inferred from nothing but when the notes landed.
 *
 * There is no click track in a practice session, so we search for the pulse
 * that best explains the gaps between onsets, preferring tempos in the range
 * humans actually play at to avoid reporting half- or double-time.
 */

import type { NoteEvent, RhythmEstimate } from '../types.ts';

/**
 * Note lengths as multiples of a beat, each with a plausibility weight. Binary
 * subdivisions are far more common than triplets, and without this preference
 * any evenly-spaced line can be explained as triplets at two-thirds the tempo.
 */
const MUSICAL_RATIOS: Array<{ ratio: number; plausibility: number }> = [
  { ratio: 0.25, plausibility: 0.95 },
  { ratio: 1 / 3, plausibility: 0.7 },
  { ratio: 0.5, plausibility: 1 },
  { ratio: 2 / 3, plausibility: 0.7 },
  { ratio: 0.75, plausibility: 0.85 },
  { ratio: 1, plausibility: 1 },
  { ratio: 1.5, plausibility: 0.85 },
  { ratio: 2, plausibility: 0.95 },
  { ratio: 3, plausibility: 0.8 },
  { ratio: 4, plausibility: 0.8 },
];

/** Gaps between consecutive onsets; the last note contributes its own length. */
export function interOnsetIntervals(notes: NoteEvent[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < notes.length; i++) out.push(notes[i]!.startMs - notes[i - 1]!.startMs);
  if (notes.length > 0) out.push(Math.max(1, notes[notes.length - 1]!.durationMs));
  return out;
}

/**
 * Per-interval trust. The final entry is a ring-out length rather than a real
 * gap — a note can be left hanging for any length — so it barely votes.
 */
function ioiWeights(count: number): number[] {
  const w = new Array(count).fill(1) as number[];
  if (count > 1) w[count - 1] = 0.25;
  return w;
}

function snapToRatio(x: number): { ratio: number; fit: number } {
  let bestRatio = 1;
  let bestFit = 0;
  for (const { ratio, plausibility } of MUSICAL_RATIOS) {
    // Tolerance scales with the ratio: a whole note may drift more than a 16th.
    const fit = Math.exp(-Math.pow((x - ratio) / (ratio * 0.22), 2)) * plausibility;
    if (fit > bestFit) { bestFit = fit; bestRatio = ratio; }
  }
  return { ratio: bestRatio, fit: bestFit };
}

function scoreTempo(iois: number[], bpm: number): number {
  const beatMs = 60000 / bpm;
  const weights = ioiWeights(iois.length);
  let total = 0;
  let weightSum = 0;
  for (let i = 0; i < iois.length; i++) {
    total += snapToRatio(iois[i]! / beatMs).fit * weights[i]!;
    weightSum += weights[i]!;
  }
  const mean = weightSum > 0 ? total / weightSum : 0;
  // Gentle prior towards tempos people actually count in, to break the
  // half-time/double-time tie that any pulse-finder suffers from.
  const prior = Math.exp(-Math.pow((Math.log(bpm) - Math.log(105)) / 0.75, 2));
  return mean * (0.75 + 0.25 * prior);
}

export function estimateRhythm(notes: NoteEvent[]): RhythmEstimate {
  const iois = interOnsetIntervals(notes);
  if (iois.length < 2) {
    return { bpm: 0, confidence: 0, beatRatios: iois.length ? [1] : [] };
  }
  let bestBpm = 100;
  let bestScore = -1;
  for (let bpm = 40; bpm <= 220; bpm += 0.5) {
    const s = scoreTempo(iois, bpm);
    if (s > bestScore) { bestScore = s; bestBpm = bpm; }
  }
  const beatMs = 60000 / bestBpm;
  const beatRatios = iois.map((x) => snapToRatio(x / beatMs).ratio);
  return {
    bpm: Math.round(bestBpm * 10) / 10,
    confidence: Math.max(0, Math.min(1, bestScore)),
    beatRatios,
  };
}

/**
 * 0..1: how evenly the notes sit on their own inferred pulse. This is what
 * separates a clean take from a scrappy one when the notes are identical.
 */
export function timingSteadiness(notes: NoteEvent[]): number {
  const iois = interOnsetIntervals(notes);
  if (iois.length < 2) return 0.5;
  const { bpm } = estimateRhythm(notes);
  if (bpm === 0) return 0.5;
  const beatMs = 60000 / bpm;
  const weights = ioiWeights(iois.length);
  let total = 0;
  let weightSum = 0;
  for (let i = 0; i < iois.length; i++) {
    total += snapToRatio(iois[i]! / beatMs).fit * weights[i]!;
    weightSum += weights[i]!;
  }
  return weightSum > 0 ? total / weightSum : 0.5;
}

/** Rhythm as a tempo-independent shape, so the same figure matches at any speed. */
export function rhythmShape(notes: NoteEvent[]): number[] {
  const all = interOnsetIntervals(notes);
  // Drop the trailing ring-out whenever there are real gaps to work with: how
  // long the last note was left hanging says nothing about the figure, and
  // including it makes the "shape" drift with tempo, which defeats the point.
  const iois = all.length > 1 ? all.slice(0, -1) : all;
  if (iois.length === 0) return [];
  const sum = iois.reduce((a, b) => a + b, 0);
  if (sum === 0) return iois.map(() => 1 / iois.length);
  return iois.map((x) => (x / sum) * iois.length);
}

/** How much faster or slower one take is than another. 1.1 means 10% faster. */
export function tempoRatio(reference: NoteEvent[], attempt: NoteEvent[]): number {
  const spanOf = (ns: NoteEvent[]) =>
    ns.length < 2 ? 0 : ns[ns.length - 1]!.startMs - ns[0]!.startMs;
  const a = spanOf(reference);
  const b = spanOf(attempt);
  if (a <= 0 || b <= 0) return 1;
  return a / b;
}
