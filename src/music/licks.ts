/**
 * Real licks. The vocabulary, not generated phrases.
 *
 * The app can invent riffs from a scale, and generated phrases are fine for
 * teaching the idea that a scale is raw material. They are not what anyone
 * actually plays. Every tradition on the guitar has a handful of lines that
 * everybody knows — the G run that ends a bluegrass verse, the turnaround
 * that sends a blues round again, the first lick every rock player learns —
 * and learning those is what makes you sound like you belong to the music
 * rather than like you are running a scale over the top of it.
 *
 * All traditional. These are the common currency of the styles they come
 * from: nobody owns the G run any more than anybody owns a handshake.
 *
 * Written in one key with its tonic recorded, so the app can move them. The
 * notes are absolute MIDI at a real playable position, not degrees, because a
 * lick is a specific shape under the hand and rounding it into scale degrees
 * is exactly how licks stop sounding like themselves.
 */

import type { NoteEvent } from '../types.ts';

export type Tradition = 'bluegrass' | 'blues' | 'rock' | 'country' | 'folk';

export interface Lick {
  id: string;
  name: string;
  tradition: Tradition;
  /** The scale it is built from, matching an id in `SCALES`. */
  scaleId: string;
  /** Pitch class it is written in, so it can be transposed. */
  tonicPc: number;
  /** 1 easiest. */
  difficulty: 1 | 2 | 3;
  /** What it is for — when a player would actually reach for it. */
  useWhen: string;
  /** Why it works, in plain words. This is the part worth stealing. */
  why: string;
  /** Absolute MIDI, beat position, length in beats. Beat 0 starts the lick. */
  notes: Array<{ midi: number; beat: number; beats: number }>;
}

export const LICKS: Lick[] = [
  {
    id: 'g-run',
    name: 'The G run',
    tradition: 'bluegrass',
    scaleId: 'major-pent',
    tonicPc: 7,
    difficulty: 1,
    useWhen: 'At the end of a line, to hand the song back to the singer. Every bluegrass guitarist alive plays this one.',
    why: 'It is five notes of G major pentatonic falling to the root, and it lands on G exactly where the singer stops. It works because it is a full stop — you hear the sentence end.',
    notes: [
      { midi: 55, beat: 0, beats: 0.5 },   // G3, open G string
      { midi: 52, beat: 0.5, beats: 0.5 }, // E3
      { midi: 50, beat: 1, beats: 0.5 },   // D3, open D
      { midi: 47, beat: 1.5, beats: 0.5 }, // B2
      { midi: 45, beat: 2, beats: 0.5 },   // A2, open A
      { midi: 43, beat: 2.5, beats: 1.5 }, // G2, low E 3rd fret — home
    ],
  },
  {
    id: 'walk-up-g',
    name: 'Walk up to the chord',
    tradition: 'bluegrass',
    scaleId: 'major',
    tonicPc: 7,
    difficulty: 1,
    useWhen: 'In the bar before the home chord arrives, on the bass strings, while you are still strumming.',
    why: 'Three steps climbing into the chord. It works because each note is one fret or one string away from the next, so the ear is pulled home before the chord even gets there.',
    notes: [
      { midi: 50, beat: 0, beats: 1 },   // D3
      { midi: 52, beat: 1, beats: 1 },   // E3
      { midi: 54, beat: 2, beats: 1 },   // F#3
      { midi: 55, beat: 3, beats: 1 },   // G3
    ],
  },
  {
    id: 'carter-c-run',
    name: 'Carter bass run',
    tradition: 'country',
    scaleId: 'major',
    tonicPc: 0,
    difficulty: 2,
    useWhen: 'Between the home chord and the next one, played with the thumb while the chord keeps ringing.',
    why: 'Maybelle Carter played the tune on the bass strings and the chord above it at the same time. This is the connective bit — it fills the gap where a singer breathes.',
    notes: [
      { midi: 48, beat: 0, beats: 0.5 },   // C3
      { midi: 50, beat: 0.5, beats: 0.5 }, // D3
      { midi: 52, beat: 1, beats: 1 },     // E3
      { midi: 50, beat: 2, beats: 0.5 },   // D3
      { midi: 48, beat: 2.5, beats: 1.5 }, // C3
    ],
  },
  {
    id: 'first-rock-lick',
    name: 'The first rock lick',
    tradition: 'rock',
    scaleId: 'minor-pent',
    tonicPc: 9,
    difficulty: 1,
    useWhen: 'Anywhere over a minor or bluesy progression. This is the one everybody learns first, and for good reason.',
    why: 'Three notes, and the shape is the top corner of the minor pentatonic box. It sounds finished because it falls back onto the root after reaching above it.',
    notes: [
      { midi: 72, beat: 0, beats: 0.5 },   // C5
      { midi: 69, beat: 0.5, beats: 0.5 }, // A4
      { midi: 67, beat: 1, beats: 0.5 },   // G4
      { midi: 69, beat: 1.5, beats: 2.5 }, // A4 — home, let it ring
    ],
  },
  {
    id: 'blues-turnaround-a',
    name: 'Blues turnaround',
    tradition: 'blues',
    scaleId: 'blues',
    tonicPc: 9,
    difficulty: 2,
    useWhen: 'The last two bars of a twelve-bar blues, to send it round again.',
    why: 'It descends, which makes it feel like an ending — then stops on the fifth instead of the root, which makes it feel unfinished. That contradiction is exactly what makes you want the next chorus.',
    notes: [
      { midi: 69, beat: 0, beats: 0.5 },   // A4
      { midi: 67, beat: 0.5, beats: 0.5 }, // G4
      { midi: 64, beat: 1, beats: 0.5 },   // E4
      { midi: 63, beat: 1.5, beats: 0.5 }, // D#4 — the blue note, passing through
      { midi: 62, beat: 2, beats: 0.5 },   // D4
      { midi: 60, beat: 2.5, beats: 0.5 }, // C4
      { midi: 57, beat: 3, beats: 1 },     // A3
      { midi: 64, beat: 4, beats: 2 },     // E4 — the fifth, hanging
    ],
  },
  {
    id: 'blue-note-slide',
    name: 'Sliding into the blue note',
    tradition: 'blues',
    scaleId: 'blues',
    tonicPc: 9,
    difficulty: 2,
    useWhen: 'Any time a blues feels too polite. One note does all of this.',
    why: 'The flat fifth is the note that sounds wrong if you sit on it and perfect if you pass through it. Here it arrives between the fourth and the fifth, which is the only place it ever really belongs.',
    notes: [
      { midi: 57, beat: 0, beats: 0.5 },   // A3
      { midi: 60, beat: 0.5, beats: 0.5 }, // C4
      { midi: 62, beat: 1, beats: 0.5 },   // D4
      { midi: 63, beat: 1.5, beats: 0.5 }, // D#4 — the blue note
      { midi: 64, beat: 2, beats: 1 },     // E4 — resolve up
      { midi: 62, beat: 3, beats: 1 },     // D4
      { midi: 57, beat: 4, beats: 2 },     // A3 — home
    ],
  },
  {
    id: 'hammer-lick-a',
    name: 'Hammer-on lick',
    tradition: 'rock',
    scaleId: 'minor-pent',
    tonicPc: 9,
    difficulty: 2,
    useWhen: 'When you want more notes than your picking hand can keep up with.',
    why: 'The second note of each pair is not picked, it is hammered. That is what makes fast playing possible — your picking hand does half the work and the line still sounds even.',
    notes: [
      { midi: 57, beat: 0, beats: 0.25 },   // A3
      { midi: 60, beat: 0.25, beats: 0.25 }, // C4 hammered
      { midi: 62, beat: 0.5, beats: 0.5 },  // D4
      { midi: 57, beat: 1, beats: 0.25 },
      { midi: 60, beat: 1.25, beats: 0.25 },
      { midi: 62, beat: 1.5, beats: 0.5 },
      { midi: 64, beat: 2, beats: 0.5 },    // E4
      { midi: 62, beat: 2.5, beats: 0.5 },
      { midi: 57, beat: 3, beats: 1 },      // A3 — home
    ],
  },
  {
    id: 'double-stop-g',
    name: 'Country double stops',
    tradition: 'country',
    scaleId: 'major-pent',
    tonicPc: 7,
    difficulty: 3,
    useWhen: 'Over the home chord when a single line sounds thin. Two notes at once is the country sound.',
    why: 'Two notes a third apart move together. It is fuller than a single line and simpler than a chord, which is the space almost all country lead playing lives in.',
    notes: [
      { midi: 62, beat: 0, beats: 1 }, { midi: 67, beat: 0, beats: 1 },     // D4 + G4
      { midi: 64, beat: 1, beats: 1 }, { midi: 69, beat: 1, beats: 1 },     // E4 + A4
      { midi: 62, beat: 2, beats: 1 }, { midi: 67, beat: 2, beats: 1 },     // back down
      { midi: 59, beat: 3, beats: 1 }, { midi: 67, beat: 3, beats: 1 },     // B3 + G4
    ],
  },
  {
    id: 'cripple-creek-a',
    name: 'Cripple Creek opening',
    tradition: 'bluegrass',
    scaleId: 'major-pent',
    tonicPc: 9,
    difficulty: 3,
    useWhen: 'The A part of Cripple Creek, and as a general major-key bluegrass phrase.',
    why: 'It climbs to the third and falls back through the scale to the root. That up-then-down arc is the shape of most fiddle-tune phrases — learn this one and you can hear it everywhere.',
    notes: [
      { midi: 61, beat: 0, beats: 0.5 },   // C#4
      { midi: 64, beat: 0.5, beats: 0.5 }, // E4
      { midi: 66, beat: 1, beats: 0.5 },   // F#4
      { midi: 64, beat: 1.5, beats: 0.5 }, // E4
      { midi: 61, beat: 2, beats: 0.5 },   // C#4
      { midi: 57, beat: 2.5, beats: 0.5 }, // A3
      { midi: 59, beat: 3, beats: 0.5 },   // B3
      { midi: 61, beat: 3.5, beats: 1.5 }, // C#4
    ],
  },
  {
    id: 'folk-hammer-em',
    name: 'Folk hammer',
    tradition: 'folk',
    scaleId: 'minor-pent',
    tonicPc: 4,
    difficulty: 1,
    useWhen: 'While the home minor chord rings. You barely have to move.',
    why: 'The chord keeps sounding underneath and one finger adds a moving note on top. It is the cheapest way to make a held chord sound like something is happening.',
    notes: [
      { midi: 52, beat: 0, beats: 0.5 },   // E3
      { midi: 55, beat: 0.5, beats: 0.5 }, // G3
      { midi: 59, beat: 1, beats: 1 },     // B3
      { midi: 55, beat: 2, beats: 0.5 },   // G3
      { midi: 52, beat: 2.5, beats: 0.5 }, // E3
      { midi: 50, beat: 3, beats: 0.5 },   // D3
      { midi: 52, beat: 3.5, beats: 1.5 }, // E3 — home
    ],
  },
];

/**
 * Move a lick to another key. Shapes move; the music does not change.
 *
 * Names must survive this. "Carter bass run in C" showed up, transposed, on a
 * song in G — the notes were right and the label was a lie. So no lick carries
 * a key in its name and the interface prints the actual one.
 */
export function transposeLick(lick: Lick, toPc: number): Lick {
  let shift = (((toPc - lick.tonicPc) % 12) + 12) % 12;
  // Prefer moving down a little over up a lot, so licks stay on the neck.
  if (shift > 6) shift -= 12;
  return {
    ...lick,
    tonicPc: toPc,
    notes: lick.notes.map((note) => ({ ...note, midi: note.midi + shift })),
  };
}

export function lickToEvents(lick: Lick, bpm = 96): NoteEvent[] {
  const beatMs = 60_000 / bpm;
  return lick.notes.map((note) => ({
    midi: note.midi,
    startMs: note.beat * beatMs,
    durationMs: Math.max(110, note.beats * beatMs * 0.92),
    confidence: 1,
    velocity: 0.62,
  }));
}

/** Licks that fit a scale, optionally moved into the key you are in. */
export function licksForScale(scaleId: string, tonicPc?: number): Lick[] {
  const matches = LICKS.filter((lick) => lick.scaleId === scaleId);
  if (tonicPc === undefined) return matches;
  return matches.map((lick) => (lick.tonicPc === tonicPc ? lick : transposeLick(lick, tonicPc)));
}

/** Licks that fit a key, across every scale that suits it. */
export function licksInKey(tonicPc: number, minor: boolean): Lick[] {
  const wanted = minor ? ['minor-pent', 'blues', 'minor'] : ['major-pent', 'major', 'mixolydian'];
  return LICKS
    .filter((lick) => wanted.includes(lick.scaleId))
    .map((lick) => (lick.tonicPc === tonicPc ? lick : transposeLick(lick, tonicPc)))
    .sort((a, b) => a.difficulty - b.difficulty);
}

export function lickById(id: string): Lick | null {
  return LICKS.find((lick) => lick.id === id) ?? null;
}
