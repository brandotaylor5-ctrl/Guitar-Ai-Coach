/** One scale, one correct octave, one clear route. Standard tuning, capo 0.
 * These are physical fret/string positions, not just pitch classes.
 * Keep the data independent of the UI so tests can catch wrong fret labels. */
export interface ScaleStudyNote {
  string: number; // 6 = low E, 1 = high E
  fret: number;   // 0 = open
  name: string;   // the written note, e.g. F#
  midi: number;
}

export interface ScaleStudy {
  id: string;
  title: string;
  subtitle: string;
  notes: readonly ScaleStudyNote[];
  home: string;
  chord: string;
}

const OPEN_MIDI: Readonly<Record<number, number>> = {
  6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64,
};

const SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

function note(string: number, fret: number): ScaleStudyNote {
  const open = OPEN_MIDI[string];
  if (open === undefined || !Number.isInteger(fret) || fret < 0 || fret > 12) {
    throw new Error('Invalid study fret position');
  }
  const midi = open + fret;
  return { string, fret, midi, name: SHARP_NAMES[midi % 12]! };
}

/** Route positions are expressed as [string number, physical fret]. */
function study(id: string, title: string, subtitle: string, chord: string, positions: readonly (readonly [number,number])[]): ScaleStudy {
  const notes = positions.map(([string, fret]) => note(string, fret));
  return { id, title, subtitle, chord, notes, home: notes[0]?.name ?? '' };
}

/** The learner sees only one lesson at a time; subsequent lessons unlock by recall. */
export const SCALE_STUDIES: readonly ScaleStudy[] = [
  study('g-major', 'G major', 'Start with the notes you have already been learning.', 'G', [
    [6,3], [6,5], [5,2], [5,3], [5,5], [4,2], [4,4], [4,5],
  ]),
  study('d-major', 'D major', 'New home note, familiar major-scale formula.', 'D', [
    [4,0], [4,2], [4,4], [3,0], [3,2], [2,0], [2,2], [2,3],
  ]),
  study('c-major', 'C major', 'An open-position route without sharps or flats.', 'C', [
    [5,3], [4,0], [4,2], [4,3], [3,0], [3,2], [2,0], [2,1],
  ]),
  study('e-minor', 'E natural minor', 'The same notes as G major, but E feels like home.', 'Em', [
    [6,0], [6,2], [6,3], [5,0], [5,2], [5,3], [4,0], [4,2],
  ]),
];

export function studyAt(index: number): ScaleStudy {
  return SCALE_STUDIES[Math.max(0, Math.min(index, SCALE_STUDIES.length - 1))]!;
}

export function studyFretMidi(string: number, fret: number): number {
  return note(string, fret).midi;
}

export function isCorrectStudySpot(expected: ScaleStudyNote, string: number, fret: number): boolean {
  return expected.string === string && expected.fret === fret;
}

export function validateStudy(study: ScaleStudy): boolean {
  if (study.notes.length !== 8) return false;
  const first = study.notes[0]!.midi;
  if (study.notes[7]!.midi !== first + 12) return false;
  for (let i = 0; i < study.notes.length; i++) {
    const n = study.notes[i]!;
    if (n.midi !== studyFretMidi(n.string, n.fret)) return false;
    if (SHARP_NAMES[n.midi % 12] !== n.name) return false;
    if (i && n.midi <= study.notes[i - 1]!.midi) return false;
  }
  return study.notes[0]!.name === study.notes[7]!.name;
}
