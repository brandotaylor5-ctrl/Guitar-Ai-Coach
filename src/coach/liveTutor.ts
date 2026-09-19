/**
 * Musical reads for Live Coach.
 *
 * Keep this layer pure. The microphone/UI can be messy; these functions take
 * already-detected music and turn it into the kind of observations a teacher
 * can actually use: harmony, melody shape, pulse and touch.
 */

import type { NoteEvent, PhraseAnalysis } from '../types.ts';
import { pcToName, pitchClass } from '../music/notes.ts';

export interface HarmonyEvent {
  rootPc: number;
  quality: string;
  label?: string;
}

export interface HarmonyCenter {
  rootPc: number;
  minor: boolean;
  confidence: number;
}

export interface ChordMove {
  label: string;
  reason: string;
  role: 'home' | 'lift' | 'tension' | 'color' | 'motion';
}

export interface MelodyRead {
  headline: string;
  detail: string;
  next: string;
  rangeSemitones: number;
  uniqueNotes: number;
}

export interface TimeRead {
  bpm: number | null;
  confidence: number;
  steadiness: number;
  headline: string;
  detail: string;
}

export interface TouchRead {
  headline: string;
  detail: string;
  confidence: number;
}

const MAJOR: Array<[number, 'major' | 'minor']> = [
  [0, 'major'], [2, 'minor'], [4, 'minor'], [5, 'major'], [7, 'major'], [9, 'minor'],
];
const MINOR: Array<[number, 'major' | 'minor']> = [
  [0, 'minor'], [3, 'major'], [5, 'minor'], [7, 'minor'], [8, 'major'], [10, 'major'],
];

export function normalizeChordLabel(label: string): string {
  return label.replaceAll('♯', '#').replaceAll('♭', 'b').trim();
}

export function compactChordLabel(label: string): string {
  const clean = normalizeChordLabel(label);
  return clean
    .replace(/\s+major$/i, '')
    .replace(/\s+minor$/i, 'm')
    .replace(/\s+diminished$/i, 'dim');
}

export function qualityFamily(quality: string): 'major' | 'minor' | 'open' {
  if (quality === 'minor' || quality === 'm7') return 'minor';
  if (quality === 'major' || quality === '7' || quality === 'maj7') return 'major';
  return 'open';
}

/**
 * Infer a likely key/tonal centre from recent chord roots and qualities.
 * This is intentionally a clue rather than a declaration: confidence travels
 * with the answer all the way to the screen.
 */
export function inferHarmonyCenter(chords: HarmonyEvent[]): HarmonyCenter | null {
  const recent = chords.slice(-6);
  if (recent.length < 2) return null;

  let best: (HarmonyCenter & { score: number }) | null = null;
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const minor of [false, true]) {
      const map = minor ? MINOR : MAJOR;
      let score = 0;
      for (let i = 0; i < recent.length; i++) {
        const chord = recent[i]!;
        const rel = (chord.rootPc - rootPc + 12) % 12;
        const expected = map.find(([pc]) => pc === rel)?.[1];
        if (!expected) {
          score -= 0.55;
          continue;
        }
        score += 1;
        const family = qualityFamily(chord.quality);
        if (family === expected) score += 0.45;
        else if (family !== 'open') score -= 0.2;

        // A phrase ending on I/i is better evidence than merely passing it.
        if (rel === 0) score += i === recent.length - 1 ? 0.5 : 0.25;
      }
      const confidence = Math.max(0, Math.min(1, score / Math.max(2, recent.length * 1.35)));
      if (!best || score > best.score) best = { rootPc, minor, confidence, score };
    }
  }
  return best && best.confidence >= 0.42
    ? { rootPc: best.rootPc, minor: best.minor, confidence: best.confidence }
    : null;
}

function symbolFor(rootPc: number, quality: 'major' | 'minor'): string {
  return `${pcToName(rootPc)}${quality === 'minor' ? 'm' : ''}`;
}

function diatonicAt(center: HarmonyCenter, relativePc: number): string | null {
  const map = center.minor ? MINOR : MAJOR;
  const quality = map.find(([pc]) => pc === relativePc)?.[1];
  if (!quality) return null;
  return symbolFor((center.rootPc + relativePc) % 12, quality);
}

function moveCandidates(center: HarmonyCenter, last: HarmonyEvent): number[] {
  const rel = (last.rootPc - center.rootPc + 12) % 12;

  if (center.minor) {
    if (rel === 0) return [8, 10, 5, 7];
    if (rel === 8) return [10, 0, 5];
    if (rel === 10) return [0, 8, 5];
    if (rel === 5) return [0, 8, 10];
    if (rel === 7) return [0, 10, 8];
    return [0, 8, 10, 5, 7];
  }

  if (rel === 0) return [5, 7, 9, 2];
  if (rel === 5) return [7, 0, 9];
  if (rel === 7) return [0, 9, 5];
  if (rel === 9) return [5, 7, 0];
  if (rel === 2) return [7, 5, 0];
  if (rel === 4) return [9, 5, 0];
  return [0, 5, 7, 9, 2];
}

function roleFor(center: HarmonyCenter, chord: string): ChordMove['role'] {
  const match = /^([A-G](?:#|b)?)(m)?/.exec(chord);
  if (!match) return 'motion';
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flats: Record<string,string> = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };
  const root = flats[match[1]!] ?? match[1]!;
  const pc = names.indexOf(root);
  if (pc < 0) return 'motion';
  const rel = (pc - center.rootPc + 12) % 12;
  if (rel === 0) return 'home';
  if ((!center.minor && rel === 7) || (center.minor && rel === 7)) return 'tension';
  if ((!center.minor && rel === 5) || (center.minor && rel === 5)) return 'lift';
  if ((!center.minor && rel === 9) || (center.minor && rel === 8)) return 'color';
  return 'motion';
}

function reasonFor(role: ChordMove['role'], center: HarmonyCenter): string {
  const home = `${pcToName(center.rootPc)} ${center.minor ? 'minor' : 'major'}`;
  switch (role) {
    case 'home': return `This takes you back to ${home} — the place that sounds settled.`;
    case 'tension': return 'This adds pull. Play it, then go back home and listen to the release.';
    case 'lift': return 'This moves away from home without sounding lost — a very common songwriting move.';
    case 'color': return 'This changes the emotional color while staying inside the same harmonic family.';
    default: return `This keeps the progression moving while still fitting ${home}.`;
  }
}

/**
 * Pick the next *teachable* chord, not merely a theoretically valid one.
 * If Live Coach cannot show the player a real shape, it does not suggest it.
 */
export function nextPlayableChord(
  center: HarmonyCenter | null,
  last: HarmonyEvent | undefined,
  availableShapes: Iterable<string>,
): ChordMove | null {
  if (!center || !last) return null;
  const available = new Set([...availableShapes].map(normalizeChordLabel));

  for (const relativePc of moveCandidates(center, last)) {
    const candidate = diatonicAt(center, relativePc);
    if (!candidate || !available.has(candidate)) continue;
    // Repeating the exact same chord is not a useful "try this next".
    if (normalizeChordLabel(candidate) === normalizeChordLabel(last.label ?? '')) continue;
    const role = roleFor(center, candidate);
    return { label: candidate, role, reason: reasonFor(role, center) };
  }
  return null;
}

function directionWord(first: number, last: number): string {
  const delta = last - first;
  if (delta >= 3) return 'rising';
  if (delta <= -3) return 'falling';
  return 'level';
}

export function readMelody(analysis: PhraseAnalysis): MelodyRead {
  const notes = analysis.phrase.notes;
  if (!notes.length) {
    return { headline: 'No melody yet', detail: 'Play a few single notes and leave a short pause.', next: 'Start with three notes.', rangeSemitones: 0, uniqueNotes: 0 };
  }

  const midis = notes.map((n) => n.midi);
  const unique = new Set(midis.map((m) => Math.round(m))).size;
  const range = Math.max(...midis) - Math.min(...midis);
  const intervals = analysis.intervals;
  const moving = intervals.filter((x) => x !== 0);
  const stepwise = moving.length ? moving.filter((x) => Math.abs(x) <= 2).length / moving.length : 1;
  const leaps = moving.length ? moving.filter((x) => Math.abs(x) >= 5).length / moving.length : 0;
  const direction = directionWord(midis[0]!, midis[midis.length - 1]!);

  let headline = 'Mixed melodic shape';
  if (unique <= 2) headline = 'A tiny repeating idea';
  else if (stepwise >= 0.68) headline = `Mostly stepwise · ${direction}`;
  else if (leaps >= 0.4) headline = `Wide, leaping line · ${direction}`;
  else headline = `Steps + jumps · ${direction}`;

  const finish = analysis.resolution === 'up'
    ? 'It finishes by climbing, so it still sounds like it wants an answer.'
    : analysis.resolution === 'down'
      ? 'It finishes by falling, which makes it feel more settled.'
      : 'It finishes close to where it was, which helps it loop.';

  let next = 'Play the same notes again and change only the rhythm.';
  if (unique <= 2) next = 'Keep that rhythm, add one neighboring note, then return to the original two.';
  else if (notes.length >= 8 && unique >= 6) next = 'Take only the first three or four notes, repeat them, and make the ending the variation.';
  else if (analysis.resolution === 'up') next = 'Repeat the same rhythm, but answer it by coming downward at the end.';
  else if (analysis.resolution === 'down') next = 'Repeat it once, then keep the rhythm and let the second ending climb instead.';
  else if (stepwise >= 0.68) next = 'Keep the contour, but make one jump of three or four frets the memorable moment.';

  return {
    headline,
    detail: `${unique} note${unique === 1 ? '' : 's'} · ${Math.round(range)}-semitone range. ${finish}`,
    next,
    rangeSemitones: range,
    uniqueNotes: unique,
  };
}

export function readTime(analysis: PhraseAnalysis, previous?: PhraseAnalysis | null): TimeRead {
  const { rhythm, quality, phrase } = analysis;
  const confidence = rhythm.confidence;
  const steadiness = quality.timingSteadiness;

  if (phrase.notes.length < 4 || confidence < 0.42 || rhythm.bpm <= 0) {
    return {
      bpm: null,
      confidence,
      steadiness,
      headline: 'Pulse still unclear',
      detail: 'Give me a slightly longer phrase or repeat the same figure twice and I can estimate the tempo.',
    };
  }

  const bpm = Math.round(rhythm.bpm);
  const feel = steadiness >= 0.82 ? 'locked'
    : steadiness >= 0.68 ? 'steady'
      : steadiness >= 0.52 ? 'settling'
        : 'loose';

  let comparison = '';
  if (previous && previous.rhythm.confidence >= 0.42 && previous.rhythm.bpm > 0) {
    const delta = (rhythm.bpm - previous.rhythm.bpm) / previous.rhythm.bpm;
    if (Math.abs(delta) >= 0.07) {
      comparison = ` You were about ${Math.round(Math.abs(delta) * 100)}% ${delta > 0 ? 'faster' : 'slower'} than the phrase before it.`;
    }
  }

  return {
    bpm,
    confidence,
    steadiness,
    headline: `~${bpm} BPM · ${feel}`,
    detail: `${Math.round(steadiness * 100)}% pulse consistency from the note spacing.${comparison}`,
  };
}

export function readTouch(notes: NoteEvent[]): TouchRead {
  const velocities = notes.map((n) => n.velocity).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (velocities.length < 4) {
    return {
      headline: 'Touch still unclear',
      detail: 'Play a few more notes and I can compare how hard you are attacking them.',
      confidence: velocities.length / 4,
    };
  }

  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  const half = Math.floor(velocities.length / 2);
  const first = velocities.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
  const second = velocities.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, velocities.length - half);
  const trend = first > 0 ? (second - first) / first : 0;

  const headline = cv >= 0.35 ? 'Big dynamic contrast'
    : cv >= 0.18 ? 'Some dynamic shape'
      : 'Mostly one volume';

  const trendText = Math.abs(trend) < 0.12
    ? 'The attack stayed at roughly the same level.'
    : trend > 0
      ? 'You leaned harder into the second half.'
      : 'You backed off in the second half.';

  return {
    headline,
    detail: trendText,
    confidence: Math.min(1, velocities.length / 8),
  };
}

/** Name the pitch class the line spent the most note-time on. */
export function anchorPitch(analysis: PhraseAnalysis): string | null {
  const totals = new Map<number, number>();
  for (const note of analysis.phrase.notes) {
    const pc = pitchClass(note.midi);
    totals.set(pc, (totals.get(pc) ?? 0) + Math.max(1, note.durationMs));
  }
  let best: [number, number] | null = null;
  for (const entry of totals) if (!best || entry[1] > best[1]) best = entry;
  return best ? pcToName(best[0]) : null;
}
