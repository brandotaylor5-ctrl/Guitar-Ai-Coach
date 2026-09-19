/**
 * Scales as something you can put your fingers on.
 *
 * A scale is only useful to a player as three things at once: a set of notes,
 * a shape under the hand, and a reason each note sounds the way it does. A
 * list of pitch classes is none of them. So this keeps all three together, and
 * derives the shape from the tuning rather than hard-coding the frets — the
 * app supports capos, drop D and DADGAD, and a memorised box is wrong in all
 * of them.
 */

import { pcToName } from './notes.ts';
import { STANDARD_TUNING } from './fretboard.ts';
import type { Tuning } from './fretboard.ts';

export interface Scale {
  id: string;
  /** What a player would call it out loud. */
  name: string;
  /** Semitones above the tonic. */
  degrees: number[];
  minor: boolean;
  /** Why anyone bothers with this one, in a sentence. */
  sound: string;
}

export const SCALES: Scale[] = [
  {
    id: 'minor-pent', name: 'minor pentatonic', degrees: [0, 3, 5, 7, 10], minor: true,
    sound: 'Five notes that sound good over almost anything in a minor key. Most rock and blues solos you know live here.',
  },
  {
    id: 'major-pent', name: 'major pentatonic', degrees: [0, 2, 4, 7, 9], minor: false,
    sound: 'The same five-note idea, but bright and open instead of moody. Country, folk and a lot of pop melodies.',
  },
  {
    id: 'blues', name: 'blues scale', degrees: [0, 3, 5, 6, 7, 10], minor: true,
    sound: 'Minor pentatonic with one extra note squeezed in. That extra note is the whole sound of the blues.',
  },
  {
    id: 'dorian-pent', name: 'Dorian pentatonic', degrees: [0, 3, 5, 7, 9], minor: true,
    sound: 'Minor pentatonic with the warmer sixth instead of the flat seventh. Moody, but with more lift and motion.',
  },
  {
    id: 'dominant-pent', name: 'dominant pentatonic', degrees: [0, 2, 4, 7, 10], minor: false,
    sound: 'A bright pentatonic with a bluesy seventh. Useful when a major sound needs more grit and less sweetness.',
  },
  {
    id: 'major', name: 'major scale', degrees: [0, 2, 4, 5, 7, 9, 11], minor: false,
    sound: 'The seven notes everything else is described against. Doh re mi.',
  },
  {
    id: 'minor', name: 'natural minor', degrees: [0, 2, 3, 5, 7, 8, 10], minor: true,
    sound: 'The seven-note minor sound. Sadder than major, and the home of a great many songs.',
  },
  {
    id: 'dorian', name: 'Dorian', degrees: [0, 2, 3, 5, 7, 9, 10], minor: true,
    sound: 'Minor with a brighter sixth. It keeps the darker center but adds forward motion instead of pure melancholy.',
  },
  {
    id: 'mixolydian', name: 'Mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10], minor: false,
    sound: 'Major with a lowered seventh. Open, rootsy and slightly unresolved — common in rock, folk, funk and jam music.',
  },
];

export function scaleById(id: string): Scale | null {
  return SCALES.find((s) => s.id === id) ?? null;
}

/**
 * What each note of a scale actually does, in words a beginner can use.
 *
 * Not interval names. "The flat seventh" tells you nothing about what happens
 * when you play it; "leans back towards home" tells you when to reach for it.
 */
const ROLES: Record<number, { short: string; role: string }> = {
  0: { short: 'home', role: 'Home. Everything sounds finished when you land here.' },
  2: { short: 'step up', role: 'One step above home — restless, wants to move.' },
  3: { short: 'the sad one', role: 'The note that makes it minor. This is where the mood comes from.' },
  4: { short: 'the bright one', role: 'The note that makes it major. Sunny, and it settles easily.' },
  5: { short: 'the strong one', role: 'Solid and neutral. A safe place to pause without ending.' },
  6: { short: 'the blue note', role: 'The bluesy one. Sounds wrong if you sit on it, perfect if you pass through it.' },
  7: { short: 'second home', role: 'The next most stable note after home. You can end on it and it sounds open rather than unfinished.' },
  9: { short: 'the sweet one', role: 'Warm and singing. Lovely just above the fifth.' },
  10: { short: 'the lean', role: 'Leans back towards home. Half of every rock riff ever written.' },
  11: { short: 'the pull', role: 'Pulls hard up to home. Almost painful to leave hanging.' },
};

export function degreeRole(semitones: number): { short: string; role: string } {
  return ROLES[((semitones % 12) + 12) % 12] ?? { short: 'colour', role: 'A colour note outside the usual five.' };
}

/** The note names of a scale, in order, starting from its tonic. */
export function scaleNoteNames(tonicPc: number, scale: Scale): string[] {
  return scale.degrees.map((d) => pcToName((tonicPc + d) % 12));
}

export interface BoxPosition {
  /** 0 is the lowest string. */
  string: number;
  fret: number;
  midi: number;
  /** Semitones above the tonic. */
  degree: number;
  isRoot: boolean;
}

export interface ScaleBox {
  positions: BoxPosition[];
  /** Lowest fret the shape uses; 0 means it sits in open position. */
  lowFret: number;
  highFret: number;
}

/**
 * The shape under the hand: every scale note inside one four-fret window.
 *
 * Derived rather than remembered. Given a tuning and a starting fret this
 * finds what is actually reachable there, so it stays correct with a capo on,
 * in drop D, or in a tuning nobody anticipated.
 */
export function scaleBox(
  tonicPc: number,
  scale: Scale,
  tuning: Tuning = STANDARD_TUNING,
  startFret = 0,
  span = 4,
): ScaleBox {
  const wanted = new Set(scale.degrees.map((d) => (tonicPc + d) % 12));
  const positions: BoxPosition[] = [];
  let lowFret = Infinity;
  let highFret = 0;

  tuning.strings.forEach((open, string) => {
    // One fret of stretch below the window is how a hand actually plays a box:
    // the first finger reaches back rather than the whole hand moving.
    for (let fret = Math.max(0, startFret); fret <= startFret + span; fret++) {
      const midi = open + fret;
      const pc = ((midi % 12) + 12) % 12;
      if (!wanted.has(pc)) continue;
      const degree = ((pc - tonicPc) % 12 + 12) % 12;
      positions.push({ string, fret, midi, degree, isRoot: degree === 0 });
      lowFret = Math.min(lowFret, fret);
      highFret = Math.max(highFret, fret);
    }
  });

  return { positions, lowFret: positions.length ? lowFret : 0, highFret };
}

/**
 * Where to put the box so the lowest note under the hand is the tonic.
 *
 * Players learn a shape by its root. A box that happens to start on the fourth
 * degree is the same notes and a completely different thing to memorise.
 */
export function rootPositionFret(tonicPc: number, tuning: Tuning = STANDARD_TUNING): number {
  const low = tuning.strings[0] ?? 40;
  for (let fret = 0; fret <= 12; fret++) {
    if (((low + fret) % 12 + 12) % 12 === tonicPc) return fret;
  }
  return 0;
}

/**
 * The scale as a line to play: up from the lowest root and back down again.
 *
 * Ascending and descending matters. Going up is a finger exercise; coming back
 * down is where people discover they only learned it one way.
 */
export function scaleRun(
  tonicPc: number,
  scale: Scale,
  tuning: Tuning = STANDARD_TUNING,
  startFret = 0,
  span = 4,
): BoxPosition[] {
  const box = scaleBox(tonicPc, scale, tuning, startFret, span);
  const up = [...box.positions].sort((a, b) => a.midi - b.midi || a.string - b.string);
  const down = [...up].reverse().slice(1);
  return [...up, ...down];
}

/** The MIDI notes of a scale spanning roughly two octaves from a low root. */
export function scaleMidiRange(tonicPc: number, scale: Scale, lowMidi: number, count: number): number[] {
  const out: number[] = [];
  let midi = lowMidi;
  while (((midi % 12) + 12) % 12 !== tonicPc) midi += 1;
  for (let octave = 0; out.length < count; octave += 1) {
    for (const degree of scale.degrees) {
      if (out.length >= count) break;
      out.push(midi + octave * 12 + degree);
    }
  }
  return out;
}
