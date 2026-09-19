/**
 * Decisions for the one-room Live Coach.
 *
 * This module is intentionally UI-free. The contract is that Coach chooses one
 * next teaching priority, keeps it concrete, and never confuses inferred pitch
 * with known physical fret/string position.
 */

import type { NoteEvent, PhraseAnalysis } from '../types.ts';
import type { PlayerProfile } from './playerModel.ts';

export type CoachPriority = 'timing' | 'melody' | 'fretboard' | 'develop';

export interface CoachPlan {
  priority: CoachPriority;
  headline: string;
  reason: string;
  instruction: string;
}

function uniquePitches(notes: NoteEvent[]): number {
  return new Set(notes.map((note) => Math.round(note.midi))).size;
}

export function planPhrase(
  analysis: PhraseAnalysis,
  profile?: PlayerProfile | null,
): CoachPlan {
  const noteCount = analysis.phrase.notes.length;
  const unique = uniquePitches(analysis.phrase.notes);

  if (
    analysis.rhythm.confidence >= .42 &&
    analysis.rhythm.bpm > 0 &&
    analysis.quality.timingSteadiness < .58
  ) {
    const bpm = Math.max(45, Math.round(analysis.rhythm.bpm * .82));
    return {
      priority: 'timing',
      headline: 'Keep the notes. Fix the pulse first.',
      reason: `The phrase is readable, but the spacing is wandering more than the pitches are.`,
      instruction: `Play the same idea around ${bpm} BPM. Do not add notes. Make the gaps boringly even, then bring the speed back.`,
    };
  }

  if (noteCount >= 3 && unique <= 2) {
    return {
      priority: 'melody',
      headline: 'You already have a motif. Give it one new note.',
      reason: `You are getting identity from repetition instead of note count, which is useful.`,
      instruction: 'Keep the rhythm and the two notes you already used. Add one neighboring note once, then come back to the original idea.',
    };
  }

  if (analysis.scale.confidence >= .55 && noteCount >= 4) {
    return {
      priority: 'fretboard',
      headline: `Put this phrase inside ${analysis.scale.label}.`,
      reason: 'Your line has enough tonal evidence to connect the sound you made to a real scale neighborhood on the neck.',
      instruction: 'Look at one playable route for your phrase, then the nearby scale notes around it. Do not memorize the whole neck — find home, then one neighboring place to move.',
    };
  }

  const habit = profile?.creative[0];
  const avoid = habit && habit.share >= .5
    ? ` You have been choosing ${habit.kind} changes a lot, so change something else this time.`
    : '';

  return {
    priority: 'develop',
    headline: 'Keep this idea. Change one thing.',
    reason: 'There is enough shape here to develop instead of replacing it with a totally new riff.',
    instruction: `Repeat it once, then change only the rhythm, space, register, or ending.${avoid}`,
  };
}

/**
 * The three-note teacher move: note before the miss, the miss, note after.
 * Rebase time to zero so playback/practice can use the result directly.
 */
export function hardPartTarget(
  reference: NoteEvent[],
  mistakeIndex: number | null,
): NoteEvent[] {
  if (!reference.length || mistakeIndex === null || mistakeIndex < 0) return [];
  const center = Math.min(reference.length - 1, mistakeIndex);
  const from = Math.max(0, center - 1);
  const to = Math.min(reference.length, center + 2);
  const slice = reference.slice(from, to);
  if (!slice.length) return [];
  const origin = slice[0]!.startMs;
  return slice.map((note) => ({ ...note, startMs: note.startMs - origin }));
}

/**
 * Pick a four-fret learning window around an inferred route.
 * This is a suggested neighborhood, never evidence of where the player was.
 */
export function learningWindow(
  frets: number[],
  maxFret = 22,
): { startFret: number; endFret: number } {
  const usable = frets.filter((fret) => Number.isFinite(fret) && fret >= 0 && fret <= maxFret);
  if (!usable.length) return { startFret: 0, endFret: 4 };
  const fretted = usable.filter((fret) => fret > 0);
  if (!fretted.length) return { startFret: 0, endFret: 4 };

  const center = Math.round(fretted.reduce((a, b) => a + b, 0) / fretted.length);
  const startFret = Math.max(0, Math.min(maxFret - 4, center - 2));
  return { startFret, endFret: Math.min(maxFret, startFret + 4) };
}
