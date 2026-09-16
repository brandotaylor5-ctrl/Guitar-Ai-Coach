/**
 * My Musical Fingerprint.
 *
 * Not generic guitar statistics — the player's own tendencies, drawn only from
 * what they actually played. The point is never to criticise a habit. It is to
 * show a musician the shape of their own vocabulary, which is something almost
 * nobody gets to see, and then to occasionally offer a door out of it.
 */

import type { NoteEvent } from '../types.ts';
import { intervalsOf, pcToName, stepDescription } from '../music/notes.ts';
import { estimateScale, homePitchClass } from '../music/key.ts';
import { estimateRhythm } from '../music/rhythm.ts';

/** Below this many takes, any "tendency" is just noise. */
export const MIN_TAKES_FOR_FINGERPRINT = 4;

export interface Tally<T> {
  value: T;
  count: number;
  /** Share of all takes, 0..1. */
  share: number;
  label: string;
}

export interface MusicalFingerprint {
  takeCount: number;
  /** True when there is enough material to say anything honestly. */
  hasEnoughMaterial: boolean;
  tonalCenters: Tally<number>[];
  /** Recurring melodic moves, as cumulative semitones, e.g. "0 → 3 → 5". */
  melodicShapes: Tally<number[]>[];
  rhythmicShapes: Tally<string>[];
  scales: Tally<string>[];
  resolution: { down: number; up: number; static: number; tendency: 'down' | 'up' | 'mixed' };
  /** Fraction of takes that start low and answer high. */
  bassThenAnswerShare: number;
  register: { lowest: number; highest: number; mean: number };
}

function tally<T>(
  items: T[],
  key: (item: T) => string,
  label: (item: T, count: number) => string,
  total: number,
): Tally<T>[] {
  const buckets = new Map<string, { value: T; count: number }>();
  for (const item of items) {
    const k = key(item);
    const existing = buckets.get(k);
    if (existing) existing.count++;
    else buckets.set(k, { value: item, count: 1 });
  }
  return [...buckets.values()]
    .map(({ value, count }) => ({ value, count, share: total ? count / total : 0, label: label(value, count) }))
    .sort((a, b) => b.count - a.count);
}

/** "0 → 3 → 5": a melodic move written as distance from where it started. */
export function renderMelodicShape(intervals: number[]): string {
  const steps = [0];
  for (const i of intervals) steps.push(steps[steps.length - 1]! + i);
  return steps.join(' → ');
}

function melodicNgrams(takes: NoteEvent[][], size: number): number[][] {
  const out: number[][] = [];
  for (const take of takes) {
    const intervals = intervalsOf(take.map((n) => n.midi));
    for (let i = 0; i + size <= intervals.length; i++) {
      const gram = intervals.slice(i, i + size);
      // A run of repeated notes is not a melodic shape worth reporting.
      if (gram.every((x) => x === 0)) continue;
      out.push(gram);
    }
  }
  return out;
}

function rhythmKey(take: NoteEvent[]): string {
  const { beatRatios } = estimateRhythm(take);
  // Drop the final ring-out, which says nothing about the figure itself.
  return beatRatios.slice(0, -1).map((r) => r.toFixed(2)).join(',');
}

export function buildFingerprint(takes: NoteEvent[][]): MusicalFingerprint {
  const usable = takes.filter((t) => t.length >= 3);
  const total = usable.length;

  const centers = usable.map((t) => homePitchClass(t));
  const tonalCenters = tally(
    centers,
    (pc) => String(pc),
    (pc) => pcToName(pc),
    total,
  );

  const grams = [...melodicNgrams(usable, 2), ...melodicNgrams(usable, 3)];
  const melodicShapes = tally(
    grams,
    (g) => g.join(','),
    (g) => renderMelodicShape(g),
    Math.max(1, grams.length),
  ).filter((t) => t.count >= 2);

  const rhythmicShapes = tally(
    usable.map(rhythmKey).filter((k) => k.length > 0),
    (k) => k,
    (k) => k.split(',').map((x) => `${Number(x)}`).join(' · '),
    total,
  ).filter((t) => t.count >= 2);

  const scales = tally(
    usable.map((t) => estimateScale(t)).filter((s) => s.confidence >= 0.5).map((s) => s.label),
    (l) => l,
    (l) => l,
    total,
  );

  let down = 0;
  let up = 0;
  let stat = 0;
  for (const take of usable) {
    const intervals = intervalsOf(take.map((n) => n.midi));
    const last = intervals[intervals.length - 1] ?? 0;
    if (last > 0) up++;
    else if (last < 0) down++;
    else stat++;
  }
  const tendency = down > up * 1.5 ? 'down' : up > down * 1.5 ? 'up' : 'mixed';

  let bassThenAnswer = 0;
  for (const take of usable) {
    if (take.length < 4) continue;
    const third = Math.max(1, Math.floor(take.length / 3));
    const opening = take.slice(0, third).reduce((s, n) => s + n.midi, 0) / third;
    const closing = take.slice(-third).reduce((s, n) => s + n.midi, 0) / third;
    if (closing - opening >= 5) bassThenAnswer++;
  }

  const allMidi = usable.flat().map((n) => n.midi);
  const register = allMidi.length
    ? {
      lowest: Math.min(...allMidi),
      highest: Math.max(...allMidi),
      mean: allMidi.reduce((a, b) => a + b, 0) / allMidi.length,
    }
    : { lowest: 0, highest: 0, mean: 0 };

  return {
    takeCount: total,
    hasEnoughMaterial: total >= MIN_TAKES_FOR_FINGERPRINT,
    tonalCenters,
    melodicShapes,
    rhythmicShapes,
    scales,
    resolution: { down, up, static: stat, tendency },
    bassThenAnswerShare: total ? bassThenAnswer / total : 0,
    register,
  };
}

/**
 * The fingerprint in the player's language. Says nothing it cannot support,
 * and says so plainly when there isn't enough to go on yet.
 */
export function describeFingerprint(fp: MusicalFingerprint): string[] {
  if (!fp.hasEnoughMaterial) {
    return [
      `There are only ${fp.takeCount} ideas here so far. Give it a few more sessions and ` +
      'patterns will start to show up — right now anything I said would just be noise.',
    ];
  }

  const lines: string[] = [];
  const top = fp.tonalCenters[0];
  if (top && top.share >= 0.4) {
    lines.push(`You return to ${top.label} more than any other home note — ${top.count} of your ${fp.takeCount} ideas sit there.`);
  }

  const shape = fp.melodicShapes[0];
  if (shape && shape.count >= 3) {
    const move = shape.value.map(stepDescription).join(', then ');
    lines.push(`You use this ${shape.label} movement constantly — ${move}. It shows up ${shape.count} times.`);
  }

  const rhythm = fp.rhythmicShapes[0];
  if (rhythm && rhythm.count >= 2) {
    lines.push(`You've written ${rhythm.count} ideas using essentially the same rhythmic shape.`);
  }

  if (fp.resolution.tendency === 'down') {
    lines.push('You tend to resolve downward rather than upward — your ideas usually settle instead of reaching.');
  } else if (fp.resolution.tendency === 'up') {
    lines.push('You tend to end by reaching upward, which leaves your ideas feeling open rather than settled.');
  }

  if (fp.bassThenAnswerShare >= 0.4) {
    lines.push('You often start low and answer yourself higher up — bass notes first, then a reply on the thinner strings.');
  }

  const scale = fp.scales[0];
  if (scale && scale.share >= 0.4) {
    lines.push(`Most of what you play fits ${scale.label}.`);
  }

  if (lines.length === 0) {
    lines.push('Nothing stands out as a habit yet — your ideas are all over the place, which is not a bad thing.');
  }
  return lines;
}

/**
 * One door out of the habit. An offer, never a correction — the player is free
 * to decide their tendency is exactly what they want.
 */
export function suggestDeparture(fp: MusicalFingerprint): string | null {
  if (!fp.hasEnoughMaterial) return null;

  if (fp.resolution.tendency === 'down') {
    return 'You normally resolve these downward. Want to hear what happens if you climb instead?';
  }
  if (fp.resolution.tendency === 'up') {
    return 'Almost everything you write ends up reaching upward. Try landing one on the note you started from and see if you like how settled it feels.';
  }
  const top = fp.tonalCenters[0];
  if (top && top.share >= 0.5) {
    const elsewhere = pcToName((top.value + 5) % 12);
    return `Nearly everything you play comes home to ${top.label}. Try the same idea starting from ${elsewhere} — same fingers, different centre of gravity.`;
  }
  const shape = fp.melodicShapes[0];
  if (shape && shape.count >= 3) {
    return `That ${shape.label} move is all over your playing. Try the same idea with that shape inverted and see whether you still recognise yourself in it.`;
  }
  return null;
}
