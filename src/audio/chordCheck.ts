/**
 * Which string is not ringing.
 *
 * Every other app can tell you that you played E minor. None of them tells you
 * that your G string is dead, which is the thing actually standing between a
 * beginner and a chord that sounds right. "It sounds wrong and I don't know
 * why" is where most people quietly stop.
 *
 * This works because the app already knows the exact note each string should
 * produce for a given shape in a given tuning. So it does not have to guess at
 * anything: it looks for that specific pitch and reports whether it is there.
 *
 * The honesty matters more than the coverage. A string whose note coincides
 * with a harmonic of a lower string cannot be judged — an open low E rings a B
 * two octaves up whether or not you are also fretting that B. Saying "I cannot
 * tell about this one" is the only truthful answer there, and it is far better
 * than telling somebody their chord is clean when it is not.
 */

import type { ChordShape } from '../music/chordShapes.ts';
import type { Tuning } from '../music/fretboard.ts';
import { STANDARD_TUNING } from '../music/fretboard.ts';

export type StringVerdict = 'ringing' | 'missing' | 'unclear' | 'not-played';

export interface StringCheck {
  /** 0 is the lowest-pitched string. */
  string: number;
  /** What a player calls it: 6 is the thick low string. */
  stringNumber: number;
  expectedMidi: number | null;
  fret: number | 'x';
  finger: number;
  verdict: StringVerdict;
}

export interface ChordCheck {
  strings: StringCheck[];
  /** Strings that are definitely not sounding, lowest first. */
  missing: StringCheck[];
  /** True when every judgeable string is ringing. */
  clean: boolean;
  /** What to say, leading with the most useful thing. */
  advice: string[];
}

/** Semitones above a fundamental where its partials land. */
const PARTIALS = [12, 19.02, 24, 27.86, 31.02, 34, 36];

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FINGERS = ['', 'index', 'middle', 'ring', 'little'];

function stringLabel(index: number, tuning: Tuning, fret: number | 'x'): string {
  const number = tuning.strings.length - index;
  const open = tuning.strings[index] ?? 40;
  const note = NAMES[((open % 12) + 12) % 12];
  return `the ${note} string${fret === 0 ? ' (open)' : ''}`;
}

/**
 * Check a strummed chord string by string.
 *
 * `perMidi` is the per-note strength from `guitarEvidence`, normalised 0..1.
 */
export function checkChordShape(
  perMidi: number[],
  shape: ChordShape,
  tuning: Tuning = STANDARD_TUNING,
  present = 0.22,
): ChordCheck {
  const expected = shape.frets.map((fret, index) => ({
    index,
    fret,
    midi: fret === 'x' ? null : (tuning.strings[index] ?? 40) + fret,
    finger: shape.fingers[index] ?? 0,
  }));

  const sounding = expected.filter((item) => item.midi !== null).map((item) => item.midi!);

  const strings: StringCheck[] = expected.map((item) => {
    const base: Omit<StringCheck, 'verdict'> = {
      string: item.index,
      stringNumber: tuning.strings.length - item.index,
      expectedMidi: item.midi,
      fret: item.fret,
      finger: item.finger,
    };
    if (item.midi === null) return { ...base, verdict: 'not-played' };

    const energy = perMidi[item.midi] ?? 0;
    if (energy < present) return { ...base, verdict: 'missing' };

    // Could a lower string in this same chord be producing this pitch as one
    // of its own harmonics? If so, hearing energy here proves nothing.
    const masked = sounding.some((lower) => lower < item.midi!
      && PARTIALS.some((offset) => Math.abs(item.midi! - lower - offset) <= 0.5));
    return { ...base, verdict: masked ? 'unclear' : 'ringing' };
  });

  const missing = strings.filter((s) => s.verdict === 'missing');
  const clean = missing.length === 0;

  return { strings, missing, clean, advice: adviceFor(missing, strings, shape, tuning, clean) };
}

/**
 * Say what to do with the hand, not what the spectrum showed.
 *
 * A dead open string is nearly always a fretting finger resting against it,
 * and the culprit is nearly always the finger on the string next door. Naming
 * that finger turns a diagnosis into an instruction.
 */
function adviceFor(
  missing: StringCheck[],
  strings: StringCheck[],
  shape: ChordShape,
  tuning: Tuning,
  clean: boolean,
): string[] {
  if (clean) {
    const unclear = strings.filter((s) => s.verdict === 'unclear').length;
    const out = [`That is a clean ${shape.name}. Every string I can judge is ringing.`];
    if (unclear > 0) {
      out.push(`${unclear === 1 ? 'One string sits' : `${unclear} strings sit`} exactly where a lower string's harmonics land, so I cannot honestly tell those apart. Pick them one at a time if you want to be sure.`);
    }
    return out;
  }

  const out: string[] = [];
  for (const dead of missing) {
    const label = stringLabel(dead.string, tuning, dead.fret);

    if (dead.fret === 0) {
      // Open string being choked. Find the nearest fretting finger.
      const neighbour = strings
        .filter((s) => s.finger > 0 && Math.abs(s.string - dead.string) <= 1)
        .sort((a, b) => Math.abs(a.string - dead.string) - Math.abs(b.string - dead.string))[0];
      out.push(neighbour
        ? `${capitalise(label)} is not sounding. Your ${FINGERS[neighbour.finger]} finger is resting against it — come up onto the very tip of that finger.`
        : `${capitalise(label)} is not sounding. Something is touching it, or your strum is not reaching it.`);
    } else if (dead.finger > 0) {
      out.push(`${capitalise(label)} is not sounding at fret ${dead.fret}. Press a little harder and move your ${FINGERS[dead.finger]} finger closer to the fret wire — just behind it, not on it.`);
    } else {
      out.push(`${capitalise(label)} is not sounding.`);
    }
  }

  if (missing.length >= 3) {
    out.push('That many at once is usually the strumming hand rather than the fretting hand — check you are crossing all the strings the shape asks for.');
  }
  out.push(shape.listenFor);
  return out;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
