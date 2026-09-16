/**
 * Where were my fingers, probably?
 *
 * A pitch alone does not tell you where it was played — E3 exists in five
 * places on a guitar. We pick the fingering a human would most plausibly use
 * by minimising hand travel across the phrase, which is what makes the
 * resulting tab feel like something you actually played.
 */

import type { FretPosition, NoteEvent } from '../types.ts';
import { midiToName } from './notes.ts';

export interface Tuning {
  name: string;
  /** MIDI note of each open string, lowest-pitched first. */
  strings: number[];
}

export const STANDARD_TUNING: Tuning = { name: 'Standard (EADGBE)', strings: [40, 45, 50, 55, 59, 64] };
export const DROP_D_TUNING: Tuning = { name: 'Drop D (DADGBE)', strings: [38, 45, 50, 55, 59, 64] };
export const HALF_STEP_DOWN: Tuning = { name: 'Eb standard', strings: [39, 44, 49, 54, 58, 63] };

export interface FingeringOptions {
  tuning?: Tuning;
  maxFret?: number;
  /** Frets beyond this from the previous note count as a position shift. */
  comfortableSpan?: number;
}

/** Every place a pitch can be played in the given tuning. */
export function positionsFor(midi: number, tuning: Tuning = STANDARD_TUNING, maxFret = 22): FretPosition[] {
  const out: FretPosition[] = [];
  for (let s = 0; s < tuning.strings.length; s++) {
    const fret = midi - tuning.strings[s]!;
    if (fret >= 0 && fret <= maxFret) out.push({ string: s, fret });
  }
  return out;
}

function positionCost(pos: FretPosition, prev: FretPosition | null, span: number): number {
  // Open strings and the low frets are where most players live.
  let cost = pos.fret === 0 ? 0 : 0.35 + pos.fret * 0.08;
  if (!prev) return cost;
  const fretJump = Math.abs(pos.fret - prev.fret);
  // Staying within one hand position is nearly free; shifting is not.
  cost += fretJump <= span ? fretJump * 0.15 : span * 0.15 + (fretJump - span) * 0.9;
  cost += Math.abs(pos.string - prev.string) * 0.2;
  return cost;
}

/**
 * Choose a playable fingering for a melodic line via dynamic programming over
 * every candidate position, minimising total hand travel.
 */
export function inferFingering(midis: number[], options: FingeringOptions = {}): FretPosition[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 22;
  const span = options.comfortableSpan ?? 4;
  if (midis.length === 0) return [];

  const layers = midis.map((m) => positionsFor(m, tuning, maxFret));
  // A pitch outside the instrument's range has no honest answer; fold it to
  // the nearest reachable position rather than inventing one.
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]!.length === 0) {
      const lowest = tuning.strings[0]!;
      const highest = tuning.strings[tuning.strings.length - 1]! + maxFret;
      const clamped = Math.min(Math.max(midis[i]!, lowest), highest);
      layers[i] = positionsFor(clamped, tuning, maxFret);
      if (layers[i]!.length === 0) layers[i] = [{ string: 0, fret: 0 }];
    }
  }

  let costs = layers[0]!.map((p) => positionCost(p, null, span));
  const back: number[][] = [layers[0]!.map(() => -1)];

  for (let i = 1; i < layers.length; i++) {
    const next: number[] = [];
    const ptr: number[] = [];
    for (const pos of layers[i]!) {
      let best = Infinity;
      let bestJ = 0;
      for (let j = 0; j < layers[i - 1]!.length; j++) {
        const c = costs[j]! + positionCost(pos, layers[i - 1]![j]!, span);
        if (c < best) { best = c; bestJ = j; }
      }
      next.push(best);
      ptr.push(bestJ);
    }
    costs = next;
    back.push(ptr);
  }

  let idx = costs.indexOf(Math.min(...costs));
  const path: FretPosition[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    path.unshift(layers[i]![idx]!);
    idx = back[i]![idx]!;
  }
  return path;
}

/** ASCII tablature, highest-pitched string on top, as tab is conventionally read. */
export function renderTab(positions: FretPosition[], tuning: Tuning = STANDARD_TUNING): string {
  const stringCount = tuning.strings.length;
  const width = Math.max(1, ...positions.map((p) => String(p.fret).length));
  const rows: string[] = [];
  for (let s = stringCount - 1; s >= 0; s--) {
    const label = midiToName(tuning.strings[s]!).replace(/-?\d+$/, '').padEnd(2, ' ');
    const cells = positions.map((p) =>
      p.string === s ? String(p.fret).padStart(width, '-') : '-'.repeat(width),
    );
    rows.push(`${label}|-${cells.join('-')}-|`);
  }
  return rows.join('\n');
}

/** Convenience: notes in, tab out. */
export function tabForNotes(notes: NoteEvent[], options: FingeringOptions = {}): string {
  const tuning = options.tuning ?? STANDARD_TUNING;
  return renderTab(inferFingering(notes.map((n) => n.midi), options), tuning);
}
