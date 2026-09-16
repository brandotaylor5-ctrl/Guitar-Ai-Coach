/**
 * The creative assistant.
 *
 * Every suggestion here is generated *from* the player's own phrase — its
 * scale, its register, its rhythm — never from a library of licks. And nothing
 * is ever presented as the right answer: options are offered to be auditioned,
 * because the player's original idea stays at the centre of the process.
 */

import type { NoteEvent, PhraseAnalysis } from '../types.ts';
import { pcToName, pitchClass } from '../music/notes.ts';
import { SCALE_TEMPLATES, pitchClassWeights } from '../music/key.ts';
import { STANDARD_TUNING } from '../music/fretboard.ts';
import type { Tuning } from '../music/fretboard.ts';
import { typicalStepMs } from '../phrase/edit.ts';

export interface SuggestOptions {
  /** Keeps suggestions inside the range of the instrument being played. */
  tuning?: Tuning;
  maxFret?: number;
}

/**
 * The lowest and highest notes that actually exist on the instrument. Without
 * this a mirrored or extended line happily runs off the bottom of the guitar,
 * and a suggestion nobody can play is worse than no suggestion.
 */
function playableRange(options: SuggestOptions = {}): { lowest: number; highest: number } {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 22;
  return {
    lowest: Math.min(...tuning.strings),
    highest: Math.max(...tuning.strings) + maxFret,
  };
}

export interface Suggestion {
  kind: string;
  label: string;
  /** Why this does what it says, in plain language. */
  description: string;
  /** The suggested continuation only. */
  notes: NoteEvent[];
  /** The player's phrase with the suggestion appended. */
  full: NoteEvent[];
}

function degreesFor(scaleName: string): number[] {
  return SCALE_TEMPLATES.find((t) => t.name === scaleName)?.degrees ?? [0, 2, 3, 5, 7, 8, 10];
}

/** Every note of the scale inside the register the player was actually using. */
export function scaleNotesInRange(tonicPc: number, degrees: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let midi = lo; midi <= hi; midi++) {
    const offset = ((pitchClass(midi) - tonicPc) % 12 + 12) % 12;
    if (degrees.includes(offset)) out.push(midi);
  }
  return out;
}

function nearestIndex(scaleNotes: number[], midi: number): number {
  let best = 0;
  for (let i = 1; i < scaleNotes.length; i++) {
    if (Math.abs(scaleNotes[i]! - midi) < Math.abs(scaleNotes[best]! - midi)) best = i;
  }
  return best;
}

/** Pick the octave of `targetPc` that sits closest to where the player just was. */
function targetNear(scaleNotes: number[], targetPc: number, from: number): number | null {
  const candidates = scaleNotes.filter((m) => pitchClass(m) === targetPc);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (Math.abs(b - from) < Math.abs(a - from) ? b : a));
}

/** Walk stepwise through the scale from `from` to `target`, ending on target. */
function stepwisePath(scaleNotes: number[], from: number, target: number, maxSteps = 3): number[] {
  const startIdx = nearestIndex(scaleNotes, from);
  const endIdx = nearestIndex(scaleNotes, target);
  const direction = Math.sign(endIdx - startIdx) || 1;
  const distance = Math.abs(endIdx - startIdx);

  if (distance === 0) {
    // Already sitting on the target. Repeating the note the player just played
    // is not a suggestion, so step away and come back — an actual cadence.
    const neighbour = scaleNotes[endIdx + 1] ?? scaleNotes[endIdx - 1];
    return neighbour === undefined ? [scaleNotes[endIdx]!] : [neighbour, scaleNotes[endIdx]!];
  }
  if (distance <= maxSteps) {
    const path: number[] = [];
    for (let i = startIdx + direction; i !== endIdx + direction; i += direction) path.push(scaleNotes[i]!);
    return path;
  }
  // Too far to walk: approach the target from one scale step away instead.
  return [scaleNotes[endIdx - direction] ?? scaleNotes[endIdx]!, scaleNotes[endIdx]!];
}

function asNotes(midis: number[], after: NoteEvent[], stepMs: number): NoteEvent[] {
  const last = after[after.length - 1];
  let cursor = last ? last.startMs + Math.max(stepMs, last.durationMs) : 0;
  return midis.map((midi) => {
    const note: NoteEvent = { midi, startMs: cursor, durationMs: stepMs * 0.8, confidence: 1 };
    cursor += stepMs;
    return note;
  });
}

/**
 * Three ways to finish this. Deliberately not ranked — the player auditions
 * them and decides, because "best" is not something the app gets to say.
 */
export function suggestEndings(analysis: PhraseAnalysis, options: SuggestOptions = {}): Suggestion[] {
  const notes = analysis.phrase.notes;
  if (notes.length === 0) return [];

  const tonicPc = analysis.scale.confidence >= 0.35 ? analysis.scale.tonicPc : analysis.homePc;
  const degrees = degreesFor(analysis.scale.scale);
  const midis = notes.map((n) => n.midi);
  const range = playableRange(options);
  const lo = Math.max(range.lowest, Math.min(...midis) - 2);
  const hi = Math.min(range.highest, Math.max(...midis) + 4);
  const scaleNotes = scaleNotesInRange(tonicPc, degrees, lo, hi);
  if (scaleNotes.length < 3) return [];

  const from = midis[midis.length - 1]!;
  const stepMs = typicalStepMs(notes);
  const home = pcToName(tonicPc);

  const plans: Array<{ kind: string; label: string; offset: number; description: string }> = [
    {
      kind: 'resolved', label: 'RESOLVED', offset: 0,
      description: `Walks back down to ${home}. This is the ending that sounds finished — like the idea has arrived somewhere.`,
    },
    {
      kind: 'unresolved', label: 'UNRESOLVED', offset: degrees.includes(7) ? 7 : degrees[degrees.length - 1]!,
      description: `Stops on ${pcToName((tonicPc + (degrees.includes(7) ? 7 : degrees[degrees.length - 1]!)) % 12)} instead of going home. It hangs there, so it sounds like a question rather than an answer.`,
    },
    {
      kind: 'darker', label: 'DARKER', offset: degrees.includes(3) ? 3 : degrees.includes(10) ? 10 : 5,
      description: 'Leans on the darker note in your scale and falls away from it rather than climbing.',
    },
  ];

  const suggestions: Suggestion[] = [];
  for (const plan of plans) {
    const targetPc = (tonicPc + plan.offset) % 12;
    const target = targetNear(scaleNotes, targetPc, plan.kind === 'darker' ? from - 4 : from);
    if (target === null) continue;
    const path = stepwisePath(scaleNotes, from, target);
    if (path.length === 0) continue;
    const suggestionNotes = asNotes(path, notes, stepMs);
    suggestions.push({
      kind: plan.kind,
      label: plan.label,
      description: plan.description,
      notes: suggestionNotes,
      full: [...notes, ...suggestionNotes],
    });
  }
  return suggestions;
}

/**
 * "Give me another riff that answers this one." Mirrors the shape of the
 * phrase — where it rose, this falls — keeping the rhythm so the two sound
 * like halves of the same thought.
 */
export function suggestAnswer(analysis: PhraseAnalysis, options: SuggestOptions = {}): Suggestion | null {
  const notes = analysis.phrase.notes;
  if (notes.length < 2) return null;

  const tonicPc = analysis.scale.confidence >= 0.35 ? analysis.scale.tonicPc : analysis.homePc;
  const degrees = degreesFor(analysis.scale.scale);
  const midis = notes.map((n) => n.midi);
  // Generous headroom: an inverted contour needs room on the side the original
  // did not use, or it collides with the edge of the range and flattens out.
  // Headroom stops at the nut and the last fret, though — a phrase that mirrors
  // its way off the bottom of the guitar is not something anyone can play.
  const range = playableRange(options);
  const lo = Math.max(range.lowest, Math.min(...midis) - 9);
  const hi = Math.min(range.highest, Math.max(...midis) + 9);
  const scaleNotes = scaleNotesInRange(tonicPc, degrees, lo, hi);
  if (scaleNotes.length < 3) return null;

  // Work in scale steps rather than semitones, so the inversion stays in key
  // whether the scale has five notes or seven.
  const offsets = [0];
  for (let i = 1; i < midis.length; i++) {
    const step = nearestIndex(scaleNotes, midis[i]!) - nearestIndex(scaleNotes, midis[i - 1]!);
    offsets.push(offsets[offsets.length - 1]! - step);
  }
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  if (maxOffset - minOffset >= scaleNotes.length) return null;

  // Place the inverted line so every note of it lands inside the range; without
  // this it clamps against the bottom and degenerates into repeated notes.
  const preferred = nearestIndex(scaleNotes, midis[midis.length - 1]!);
  const startIdx = Math.min(
    Math.max(preferred, -minOffset),
    scaleNotes.length - 1 - maxOffset,
  );
  const answerMidis = offsets.map((o) => scaleNotes[startIdx + o]!);

  const stepMs = typicalStepMs(notes);
  const answerNotes = asNotes(answerMidis, notes, stepMs);
  return {
    kind: 'answer',
    label: 'ANSWER',
    description:
      'Same rhythm as your phrase, but the shape is turned upside down — where yours climbed, this one falls. ' +
      'Played after yours, it sounds like a reply.',
    notes: answerNotes,
    full: [...notes, ...answerNotes],
  };
}

export interface ChordSuggestion {
  rootPc: number;
  quality: 'major' | 'minor' | 'diminished';
  label: string;
  /** How much of what you played is already inside this chord, 0..1. */
  fit: number;
  description: string;
}

/**
 * "What chord could sit underneath this?" Scored by how much of the player's
 * own material each chord already contains.
 */
export function suggestChords(analysis: PhraseAnalysis, limit = 3): ChordSuggestion[] {
  const notes = analysis.phrase.notes;
  if (notes.length === 0) return [];

  const tonicPc = analysis.scale.confidence >= 0.35 ? analysis.scale.tonicPc : analysis.homePc;
  const degrees = degreesFor(analysis.scale.scale);
  const weights = pitchClassWeights(notes);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const inScale = (pc: number) => degrees.includes(((pc - tonicPc) % 12 + 12) % 12);

  const out: ChordSuggestion[] = [];
  for (const degree of degrees) {
    const root = (tonicPc + degree) % 12;
    const third = inScale((root + 4) % 12) ? 4 : inScale((root + 3) % 12) ? 3 : null;
    const fifth = inScale((root + 7) % 12) ? 7 : inScale((root + 6) % 12) ? 6 : null;
    if (third === null || fifth === null) continue;

    const tones = [root, (root + third) % 12, (root + fifth) % 12];
    const fit = tones.reduce((s, pc) => s + weights[pc]!, 0) / total;
    const quality: ChordSuggestion['quality'] =
      fifth === 6 ? 'diminished' : third === 3 ? 'minor' : 'major';
    const label = `${pcToName(root)} ${quality}`;
    out.push({
      rootPc: root,
      quality,
      label,
      fit,
      description:
        `${Math.round(fit * 100)}% of what you played is already inside ${label}` +
        (root === analysis.homePc ? ' — and it is built on your home note, so it will sound like the ground under the riff.' : '.'),
    });
  }

  return out.sort((a, b) => b.fit - a.fit).slice(0, limit);
}
