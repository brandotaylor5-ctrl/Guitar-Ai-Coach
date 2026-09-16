/**
 * Theory has to emerge from the player's own music, never precede it.
 *
 * The rule enforced here: say the musical fact in plain words first, name the
 * player's own notes and frets, and only then — optionally, and always last —
 * offer the term musicians use for it. A beginner should be able to read the
 * first paragraph and act on it without knowing a single interval name.
 */

import type { NoteEvent, PhraseAnalysis } from '../types.ts';
import { intervalName, midiToName, pcToName, pitchClass } from '../music/notes.ts';
import { positionsFor, STANDARD_TUNING } from '../music/fretboard.ts';
import type { Tuning } from '../music/fretboard.ts';
import { thirdQuality } from '../music/key.ts';

export interface Explanation {
  /** The one-sentence version. */
  headline: string;
  /** Plain-language observations. No jargon. */
  plain: string[];
  /** The same facts named the way musicians name them. Always optional. */
  theory: string[];
}

const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'];

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "on your low E string, that's the 3rd fret" — the beginner's real question. */
export function describeFretLocation(midi: number, tuning: Tuning = STANDARD_TUNING): string {
  const options = positionsFor(midi, tuning, 12);
  if (options.length === 0) return `${midiToName(midi)} is outside the usual range`;
  // Lowest fret wins, ties going to the lower string: a beginner hunting for a
  // note reaches for first position, not the 8th fret of the low E. (This is a
  // different job from `inferFingering`, which optimises a whole phrase.)
  const pick = options.reduce((a, b) => {
    if (b.fret !== a.fret) return b.fret < a.fret ? b : a;
    return b.string < a.string ? b : a;
  });
  const stringName = STRING_NAMES[pick.string] ?? `string ${pick.string + 1}`;
  return pick.fret === 0
    ? `on your ${stringName} string, that's the open string`
    : `on your ${stringName} string, that's the ${ordinal(pick.fret)} fret`;
}

function shapeOf(analysis: PhraseAnalysis): string {
  const { intervals } = analysis;
  if (intervals.length === 0) return 'a single note';
  const up = intervals.filter((i) => i > 0).length;
  const down = intervals.filter((i) => i < 0).length;
  const net = analysis.phrase.notes[analysis.phrase.notes.length - 1]!.midi - analysis.phrase.notes[0]!.midi;
  if (up > 0 && down > 0 && Math.abs(net) <= 2) return 'it goes up and then comes back to where it started';
  if (net > 2) return 'it climbs as it goes';
  if (net < -2) return 'it falls as it goes';
  return 'it stays in one place and circles around';
}

/** The plain-language read of one idea. */
export function explainPhrase(analysis: PhraseAnalysis, tuning: Tuning = STANDARD_TUNING): Explanation {
  const { notes } = analysis.phrase;
  const plain: string[] = [];
  const theory: string[] = [];
  const home = pcToName(analysis.homePc);
  const homeNote = notes.find((n) => pitchClass(n.midi) === analysis.homePc) ?? notes[0];

  plain.push(`You kept coming back to ${home} — that's your home note here.`);
  if (homeNote) plain.push(`${home} is easy to find: ${describeFretLocation(homeNote.midi, tuning)}.`);

  const third = thirdQuality(notes, analysis.homePc);
  if (third === 'minor') {
    const darkPc = (analysis.homePc + 3) % 12;
    const darkNote = notes.find((n) => pitchClass(n.midi) === darkPc);
    plain.push(
      `The ${pcToName(darkPc)} you keep using is the note that makes this sound dark` +
      (darkNote ? ` — ${describeFretLocation(darkNote.midi, tuning)}.` : '.'),
    );
    theory.push(`${home} to ${pcToName(darkPc)} is a ${intervalName(3)}. That gap is what "minor" means.`);
  } else if (third === 'major') {
    const brightPc = (analysis.homePc + 4) % 12;
    plain.push(`The ${pcToName(brightPc)} in there is what gives this its brighter, more open feel.`);
    theory.push(`${home} to ${pcToName(brightPc)} is a ${intervalName(4)} — the interval behind a major sound.`);
  }

  plain.push(`Shape-wise, ${shapeOf(analysis)}.`);

  if (analysis.resolution === 'down') {
    plain.push('You finished by stepping downward, which is why it sounds settled at the end.');
  } else if (analysis.resolution === 'up') {
    plain.push('You finished by stepping upward, so it sounds like it wants to keep going.');
  }

  if (analysis.rhythm.bpm > 0 && analysis.rhythm.confidence > 0.55) {
    plain.push(`You were playing this at roughly ${Math.round(analysis.rhythm.bpm)} beats per minute.`);
  }

  if (analysis.scale.confidence >= 0.6) {
    theory.push(`All of these notes fit ${analysis.scale.label}.`);
  } else if (analysis.scale.confidence >= 0.35) {
    theory.push(`This leans towards ${analysis.scale.label}, though there isn't quite enough here to be sure.`);
  }

  const headline = `${analysis.noteNames.join(' → ')} — centred on ${home}${
    third === 'minor' ? ', and on the darker side' : third === 'major' ? ', and on the brighter side' : ''
  }.`;

  return { headline, plain, theory };
}

/** Direct answer to "why does this sound sad?" — and it must cite the player's notes. */
export function explainMood(analysis: PhraseAnalysis, tuning: Tuning = STANDARD_TUNING): Explanation {
  const { notes } = analysis.phrase;
  const home = pcToName(analysis.homePc);
  const plain: string[] = [];
  const theory: string[] = [];
  const third = thirdQuality(notes, analysis.homePc);

  if (third === 'minor') {
    const darkPc = (analysis.homePc + 3) % 12;
    const darkNote = notes.find((n) => pitchClass(n.midi) === darkPc);
    plain.push(
      `Mostly one note is doing it: the ${pcToName(darkPc)}. Against your home note ${home}, ` +
      `that particular gap is the sound people hear as sad` +
      (darkNote ? ` (${describeFretLocation(darkNote.midi, tuning)})` : '') + '.',
    );
    plain.push(`If you moved that ${pcToName(darkPc)} up by one fret, the whole thing would brighten immediately. Try it.`);
    theory.push(`That gap is a ${intervalName(3)}. Moving it up one fret makes it a ${intervalName(4)} — minor becomes major.`);
  } else if (third === 'major') {
    plain.push(`This one actually isn't sad — the notes you're using sit on the bright side of ${home}.`);
  } else {
    plain.push(`You haven't played the note that would decide this either way yet — the one that sets bright against dark is missing.`);
    theory.push(`You have not played a third above ${home}. That degree is what fixes major or minor.`);
  }

  const lowest = Math.min(...notes.map((n) => n.midi));
  if (lowest <= 45) plain.push('Playing it down in the low strings adds to the weight of it, too.');
  if (analysis.resolution === 'up') plain.push("Ending on a note that's still reaching upward leaves it unresolved, which adds to the feeling.");

  return { headline: `Why ${home} sounds the way it does here`, plain, theory };
}

/** Flatten an explanation to text, plain part first, theory clearly separated. */
export function renderExplanation(e: Explanation, includeTheory = true): string {
  const parts = [e.headline, '', ...e.plain];
  if (includeTheory && e.theory.length) {
    parts.push('', 'If you want the names for it:', ...e.theory.map((t) => `  ${t}`));
  }
  return parts.join('\n');
}

/** Convenience for callers holding raw notes. */
export function describeNotes(notes: NoteEvent[]): string {
  return notes.map((n) => midiToName(n.midi)).join(' → ');
}
