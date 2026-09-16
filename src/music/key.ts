/**
 * "What scale am I accidentally using?"
 *
 * We score every (tonic, scale) pair on three things a listener actually cares
 * about: does the scale explain the notes played, does the suspected home note
 * behave like home, and is the scale the *smallest* one that fits. That last
 * term is what stops every bluesy lick from being reported as some seven-note
 * mode when the player only ever touched five notes.
 */

import type { NoteEvent, ScaleEstimate } from '../types.ts';
import { pcToName, pitchClass } from './notes.ts';

export interface ScaleTemplate {
  name: string;
  /** Semitone offsets from the tonic. */
  degrees: number[];
}

export const SCALE_TEMPLATES: ScaleTemplate[] = [
  { name: 'minor pentatonic', degrees: [0, 3, 5, 7, 10] },
  { name: 'major pentatonic', degrees: [0, 2, 4, 7, 9] },
  { name: 'blues', degrees: [0, 3, 5, 6, 7, 10] },
  { name: 'major', degrees: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'minor', degrees: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'dorian', degrees: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'phrygian', degrees: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'lydian', degrees: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'harmonic minor', degrees: [0, 2, 3, 5, 7, 8, 11] },
];

/**
 * How much each pitch class was "used", weighted by how long it rang and how
 * sure the detector was. Notes that land at the end of a phrase get extra
 * weight, because that is where a listener hears resolution.
 */
export function pitchClassWeights(notes: NoteEvent[], restingIndices: Set<number> = new Set()): number[] {
  const w = new Array(12).fill(0) as number[];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    // Cap duration so one held drone cannot drown out the melody.
    const dur = Math.min(n.durationMs, 1500) / 1000;
    let weight = (0.25 + dur) * Math.max(0.1, n.confidence);
    if (restingIndices.has(i)) weight *= 2.2;
    w[pitchClass(n.midi)] = w[pitchClass(n.midi)]! + weight;
  }
  return w;
}

/** Indices of notes that function as resting points: phrase ends and long notes. */
export function restingPoints(notes: NoteEvent[]): Set<number> {
  const out = new Set<number>();
  if (notes.length === 0) return out;
  out.add(notes.length - 1);
  out.add(0);
  const durations = notes.map((n) => n.durationMs).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)] ?? 0;
  notes.forEach((n, i) => { if (n.durationMs > median * 1.8) out.add(i); });
  return out;
}

interface Scored { tonicPc: number; scale: string; score: number }

function scoreCandidates(weights: number[]): Scored[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const maxW = Math.max(...weights);
  const present = weights.map((w) => w / total > 0.02);
  const scored: Scored[] = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const tpl of SCALE_TEMPLATES) {
      const pcs = tpl.degrees.map((d) => (tonic + d) % 12);
      const inScale = pcs.reduce((sum, pc) => sum + weights[pc]!, 0);
      const coverage = inScale / total;
      const unused = pcs.filter((pc) => !present[pc]).length / pcs.length;
      const tonicScore = maxW > 0 ? weights[tonic]! / maxW : 0;
      const score = 0.55 * coverage + 0.25 * tonicScore + 0.2 * (1 - unused);
      scored.push({ tonicPc: tonic, scale: tpl.name, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function estimateScale(notes: NoteEvent[]): ScaleEstimate {
  if (notes.length === 0) {
    return { tonicPc: 0, scale: 'unknown', confidence: 0, label: 'not enough to tell yet' };
  }
  const weights = pitchClassWeights(notes, restingPoints(notes));
  const ranked = scoreCandidates(weights);
  const best = ranked[0];
  if (!best) return { tonicPc: 0, scale: 'unknown', confidence: 0, label: 'not enough to tell yet' };

  const margin = best.score - (ranked[1]?.score ?? 0);
  const distinct = weights.filter((w) => w > 0).length;
  let confidence = best.score * (0.7 + 0.3 * Math.min(1, margin / 0.06));
  // Three notes cannot pin down a scale, and we should say so.
  if (distinct < 3) confidence = Math.min(confidence, 0.35);
  else if (distinct < 4) confidence = Math.min(confidence, 0.6);

  return {
    tonicPc: best.tonicPc,
    scale: best.scale,
    confidence: Math.max(0, Math.min(1, confidence)),
    label: `${pcToName(best.tonicPc)} ${best.scale}`,
  };
}

/** The runners-up, for when the app should admit the reading is ambiguous. */
export function scaleAlternatives(notes: NoteEvent[], count = 3): ScaleEstimate[] {
  const weights = pitchClassWeights(notes, restingPoints(notes));
  return scoreCandidates(weights).slice(0, count).map((s) => ({
    tonicPc: s.tonicPc,
    scale: s.scale,
    confidence: Math.max(0, Math.min(1, s.score)),
    label: `${pcToName(s.tonicPc)} ${s.scale}`,
  }));
}

/**
 * The note the line keeps coming home to. Often but not always the scale tonic
 * — a player can noodle in E minor pentatonic while resting on G.
 */
export function homePitchClass(notes: NoteEvent[]): number {
  const weights = pitchClassWeights(notes, restingPoints(notes));
  let best = 0;
  for (let i = 1; i < 12; i++) if (weights[i]! > weights[best]!) best = i;
  return best;
}

/** Is there a minor or major third above the tonal centre? This is what "dark" means. */
export function thirdQuality(notes: NoteEvent[], tonicPc: number): 'minor' | 'major' | 'ambiguous' {
  const weights = pitchClassWeights(notes);
  const minor = weights[(tonicPc + 3) % 12]!;
  const major = weights[(tonicPc + 4) % 12]!;
  if (minor === 0 && major === 0) return 'ambiguous';
  if (minor > major * 1.2) return 'minor';
  if (major > minor * 1.2) return 'major';
  return 'ambiguous';
}
