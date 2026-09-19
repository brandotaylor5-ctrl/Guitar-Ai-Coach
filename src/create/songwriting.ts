/**
 * Small songwriting transformations for a player's own phrase.
 *
 * The rule is deliberately strict: change one compositional dimension at a
 * time so the player can hear cause and effect. This is development, not a
 * random-melody generator.
 */

import type { NoteEvent } from '../types.ts';

export type MotifBranchKind = 'rhythm' | 'space' | 'register';

export interface MotifBranch {
  kind: MotifBranchKind;
  label: string;
  principle: string;
  notes: NoteEvent[];
}

function baseGap(notes: NoteEvent[]): number {
  if (notes.length < 2) return 500;
  const gaps: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i]!.startMs - notes[i - 1]!.startMs;
    if (gap > 40) gaps.push(gap);
  }
  if (!gaps.length) return 500;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 500;
}

function retime(notes: NoteEvent[], ratios: number[]): NoteEvent[] {
  const beat = baseGap(notes);
  let at = 0;
  return notes.map((note, index) => {
    const ratio = ratios[index] ?? 1;
    const next = {
      ...note,
      startMs: at,
      durationMs: Math.max(100, beat * ratio * .82),
    };
    at += beat * ratio;
    return next;
  });
}

export function motifBranches(notes: NoteEvent[]): MotifBranch[] {
  if (notes.length < 3) return [];
  const copy = notes.map((note) => ({ ...note }));

  const rhythmRatios = copy.map((_, index) => {
    const cell = index % 4;
    if (cell === 0 || cell === 1) return .5;
    if (cell === 2) return 1;
    return 1.5;
  });
  const rhythm = retime(copy, rhythmRatios);

  const middle = Math.max(1, Math.floor(copy.length / 2));
  const spaceNotes = copy.filter((_, index) => index !== middle);
  const space = retime(spaceNotes, spaceNotes.map((_, index) =>
    index === Math.max(0, middle - 1) ? 1.75 : 1));

  const register = retime(copy.map((note, index) => {
    if (index < Math.floor(copy.length / 2)) return note;
    const higher = note.midi + 12;
    return { ...note, midi: higher <= 88 ? higher : note.midi };
  }), copy.map(() => 1));

  return [
    {
      kind: 'rhythm',
      label: 'Keep the pitches · rewrite the rhythm',
      principle: 'If the notes still feel related but the personality changes, you are hearing how strongly rhythm carries identity.',
      notes: rhythm,
    },
    {
      kind: 'space',
      label: 'Remove one note · make room',
      principle: 'A section can become more expressive by subtracting. The silence makes the notes around it matter more.',
      notes: space,
    },
    {
      kind: 'register',
      label: 'Lift the second half',
      principle: 'Register creates contrast without requiring a new idea. This is a simple way to make a second section feel larger.',
      notes: register,
    },
  ];
}
