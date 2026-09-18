/**
 * Riffs you can play today, and riffs nobody has played before.
 *
 * The app's premise is that your own playing is the curriculum. That premise
 * quietly assumes you can already improvise — and if you cannot yet, the
 * sketchbook is an empty book and the whole thing has nothing to say to you.
 *
 * So this is the on-ramp. It builds short, real phrases out of a scale the
 * player is learning, explains what every note is doing, and can invent new
 * ones rather than only handing over a fixed list. The point is not the riff.
 * The point is that after playing a few and being told why they work, the
 * player has something of their own to put in the book.
 */

import type { NoteEvent } from '../types.ts';
import { degreeRole, scaleMidiRange } from '../music/scales.ts';
import type { Scale } from '../music/scales.ts';
import { midiToName } from '../music/notes.ts';

export interface RiffNote {
  midi: number;
  /** Index into the scale's degrees, 0 is the tonic. */
  step: number;
  /** Semitones above the tonic. */
  degree: number;
  beats: number;
  name: string;
  /** What this note is doing here, in plain words. */
  role: string;
  shortRole: string;
}

export interface Riff {
  id: string;
  name: string;
  /** One line on how it should feel to play. */
  feel: string;
  /** The single idea it teaches. */
  idea: string;
  notes: RiffNote[];
  /** Why this riff holds together, written for someone who is not sure yet. */
  why: string[];
}

/** Turn a riff into something the player can hear. */
export function riffToEvents(riff: Riff, bpm = 84): NoteEvent[] {
  const beatMs = 60_000 / bpm;
  let at = 0;
  return riff.notes.map((note) => {
    const event: NoteEvent = {
      midi: note.midi,
      startMs: at,
      durationMs: Math.max(120, note.beats * beatMs * 0.92),
      confidence: 1,
      velocity: 0.62,
    };
    at += note.beats * beatMs;
    return event;
  });
}

function buildNotes(steps: number[], rhythm: number[], scale: Scale, tonicPc: number, lowMidi: number): RiffNote[] {
  const ladder = scaleMidiRange(tonicPc, scale, lowMidi, scale.degrees.length * 3);
  return steps.map((step, i) => {
    const index = Math.max(0, Math.min(ladder.length - 1, step));
    const midi = ladder[index]!;
    const degree = scale.degrees[((step % scale.degrees.length) + scale.degrees.length) % scale.degrees.length]!;
    const { short, role } = degreeRole(degree);
    return {
      midi, step, degree,
      beats: rhythm[i % rhythm.length] ?? 1,
      name: midiToName(midi),
      shortRole: short,
      role,
    };
  });
}

/**
 * A rhythmic cell is what makes a riff recognisable.
 *
 * Players reach for pitches first and wonder why their lines sound like
 * exercises. Almost every riff anyone can hum is a rhythm that repeats with
 * the notes changed underneath it, so that is what gets generated here.
 */
const CELLS: Array<{ rhythm: number[]; feel: string }> = [
  { rhythm: [0.5, 0.5, 1], feel: 'Two quick notes then a longer one — the most useful three-note rhythm on the instrument.' },
  { rhythm: [0.75, 0.25, 1], feel: 'A lazy pair that lands late, which gives it a swagger.' },
  { rhythm: [0.5, 0.25, 0.25, 1], feel: 'A little run into a held note.' },
  { rhythm: [1, 0.5, 0.5], feel: 'Starts settled, then hurries at the end.' },
  { rhythm: [0.25, 0.25, 0.5, 1], feel: 'A quick pickup before the real note arrives.' },
];

/** Contours are described as scale steps from where the phrase begins. */
const CONTOURS: Array<{ shape: number[]; idea: string }> = [
  { shape: [0, 1, 2], idea: 'Climbing three notes in a row.' },
  { shape: [0, 2, 1], idea: 'Reaching past a note and then filling it in.' },
  { shape: [2, 1, 0], idea: 'Falling home from above.' },
  { shape: [0, -1, 0], idea: 'Dipping below home and coming straight back.' },
  { shape: [0, 3, 1], idea: 'A jump out and a step back — leaps stop a line sounding like a scale.' },
  { shape: [0, 0, 2], idea: 'Repeating a note before moving, so the move lands harder.' },
];

/** A small deterministic generator, so "another one" is new but reproducible. */
function rng(seed: number): () => number {
  let state = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

/**
 * Invent a riff in a scale the player is working on.
 *
 * Constrained rather than random: it states an idea, answers it with the same
 * rhythm moved somewhere else, and comes home. Those three things are most of
 * what separates a phrase from a finger exercise, and each one is named in the
 * explanation so the player can steal the technique rather than the riff.
 */
export function inventRiff(scale: Scale, tonicPc: number, lowMidi: number, seed: number): Riff {
  const random = rng(seed);
  const cell = pick(CELLS, random);
  const call = pick(CONTOURS, random);
  const response = pick(CONTOURS, random);

  // The answer starts somewhere else, which is what makes it an answer rather
  // than a repeat. Keeping it inside the scale means it cannot sound wrong.
  const lift = pick([2, 3, -2, 4], random);
  const openEnding = random() < 0.35;
  const last = openEnding ? 4 : 0;

  const steps = [
    ...call.shape,
    ...response.shape.map((s) => s + lift),
    last,
  ].map((s) => s + scale.degrees.length); // start an octave up so dips stay in range

  const rhythm = [...cell.rhythm, ...cell.rhythm, 2];
  const notes = buildNotes(steps, rhythm, scale, tonicPc, lowMidi);

  const why = [
    `${cell.feel} It is used twice, which is what makes the two halves sound like one idea.`,
    `First half: ${call.idea.toLowerCase().replace(/\.$/, '')}. Second half: the same rhythm, ${lift > 0 ? 'higher' : 'lower'} — a question and an answer.`,
    openEnding
      ? 'It ends on the fifth rather than home, so it sounds open, like there should be another bar. Useful when you want to keep going.'
      : 'It ends on home, so it sounds finished. Play it twice and it already feels like a riff.',
  ];

  return {
    id: `invented-${seed}`,
    name: 'A riff nobody has played yet',
    feel: cell.feel,
    idea: 'Say something, answer it, come home.',
    notes,
    why,
  };
}

/**
 * Change one thing about a riff and keep the rest.
 *
 * This is the move that turns a riff someone was given into a riff that is
 * theirs, and it is the same move the app asks of a player's own ideas later
 * on. Doing it to a supplied riff first is how the idea gets taught at all.
 */
export function varyRiff(riff: Riff, scale: Scale, tonicPc: number, lowMidi: number, seed: number): Riff {
  const random = rng(seed);
  const kind = pick(['tail', 'lift', 'rhythm', 'thin'] as const, random);
  const steps = riff.notes.map((n) => n.step);
  const rhythm = riff.notes.map((n) => n.beats);

  let changed = 'one note';
  let newSteps = [...steps];
  let newRhythm = [...rhythm];

  if (kind === 'tail') {
    const alternatives = [0, 4, 2].filter((s) => s !== steps[steps.length - 1]! % scale.degrees.length);
    newSteps[newSteps.length - 1] = (steps[steps.length - 1]! - (steps[steps.length - 1]! % scale.degrees.length))
      + pick(alternatives, random);
    changed = 'where it lands at the end — the same phrase can sound finished or unfinished purely from its last note';
  } else if (kind === 'lift') {
    const half = Math.floor(steps.length / 2);
    newSteps = steps.map((s, i) => (i >= half && i < steps.length - 1 ? s + 2 : s));
    changed = 'the second half, moved up — the shape is identical, so it still sounds like the same idea';
  } else if (kind === 'rhythm') {
    newRhythm = rhythm.map((b, i) => (i === 0 ? b / 2 : i === 1 ? b * 1.5 : b));
    changed = 'only the rhythm of the opening — the notes are untouched and it is already a different riff';
  } else {
    const keep = steps.filter((_, i) => i !== 1);
    newSteps = keep;
    newRhythm = rhythm.filter((_, i) => i !== 1);
    changed = 'one note taken out — space is a thing you add on purpose, not what is left over';
  }

  return {
    id: `${riff.id}-var${seed}`,
    name: 'Your version',
    feel: riff.feel,
    idea: 'Change one thing, keep the rest.',
    notes: buildNotes(newSteps, newRhythm, scale, tonicPc, lowMidi),
    why: [
      `Same riff, with ${changed}.`,
      'This is the whole move: a riff is not a fixed object, it is something you push on. Play both and pick the one you like.',
    ],
  };
}

/** Riffs built from a scale, for a player who has nothing of their own yet. */
export function starterRiffs(scale: Scale, tonicPc: number, lowMidi: number, count = 3): Riff[] {
  return Array.from({ length: count }, (_, i) => inventRiff(scale, tonicPc, lowMidi, (tonicPc + 1) * 7919 + i * 104729));
}
