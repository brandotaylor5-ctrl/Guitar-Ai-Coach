/**
 * Concrete beginner chord shapes.
 *
 * A curriculum may decide *what* is worth learning next, but it must never
 * assume that naming a chord teaches it. These shapes are the bridge from a
 * musical idea ("learn A minor") to the physical thing a beginner actually
 * needs: which string, which fret, which finger, what not to hit, and what to
 * listen for.
 */

export type Fret = number | 'x';
export type Finger = 0 | 1 | 2 | 3 | 4;

export interface ChordShape {
  /** Detector / curriculum label, e.g. Am. */
  chord: string;
  name: string;
  /** Low E → high E. 0=open, x=do not play. */
  frets: [Fret, Fret, Fret, Fret, Fret, Fret];
  /** Low E → high E. 1=index, 2=middle, 3=ring, 4=pinky, 0=open/muted. */
  fingers: [Finger, Finger, Finger, Finger, Finger, Finger];
  /** First string to strum, where 6 is the thick low E and 1 is the thin high E. */
  strumFrom: 1 | 2 | 3 | 4 | 5 | 6;
  /** Short physical instructions, in the order a beginner should place them. */
  steps: string[];
  /** One common failure worth listening for. */
  listenFor: string;
  /** A small relationship to something the player may already know. */
  connection?: string;
  /** True when this is intentionally an easier partial voicing. */
  beginnerVoicing?: boolean;
}

const SHAPES: ChordShape[] = [
  {
    chord: 'Em', name: 'E minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], strumFrom: 6,
    steps: [
      'Middle finger: 5th string (A), fret 2.',
      'Ring finger: 4th string (D), fret 2.',
      'Leave every other string open and strum all 6 strings.',
    ],
    listenFor: 'All six strings should ring. If one of the middle strings is dead, arch those two fretting fingers a little more.',
    connection: 'This is one of the simplest full chords on guitar: two fingers, all six strings.',
  },
  {
    chord: 'E', name: 'E major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], strumFrom: 6,
    steps: [
      'Middle finger: 5th string (A), fret 2.',
      'Ring finger: 4th string (D), fret 2.',
      'Index finger: 3rd string (G), fret 1.',
      'Strum all 6 strings.',
    ],
    listenFor: 'The open B and high E strings should still ring clearly under your index finger.',
    connection: 'It is E minor plus one finger: put your index on the G string, fret 1.',
  },
  {
    chord: 'Am', name: 'A minor', frets: ['x', 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], strumFrom: 5,
    steps: [
      'Index finger: 2nd string (B), fret 1.',
      'Middle finger: 4th string (D), fret 2.',
      'Ring finger: 3rd string (G), fret 2.',
      'Start your strum on the 5th string (A). Do not hit the thick low E string.',
    ],
    listenFor: 'The thin high E string should ring open. If it is muted, curl your index finger more.',
    connection: 'The shape feels a lot like E major moved one string toward the floor.',
  },
  {
    chord: 'A', name: 'A major', frets: ['x', 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], strumFrom: 5,
    steps: [
      'Index finger: 4th string (D), fret 2.',
      'Middle finger: 3rd string (G), fret 2.',
      'Ring finger: 2nd string (B), fret 2.',
      'Start on the 5th string (A) and leave the thin high E open.',
    ],
    listenFor: 'Three fingers share fret 2, so keep them narrow and on their fingertips so the high E keeps ringing.',
  },
  {
    chord: 'D', name: 'D major', frets: ['x', 'x', 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], strumFrom: 4,
    steps: [
      'Index finger: 3rd string (G), fret 2.',
      'Ring finger: 2nd string (B), fret 3.',
      'Middle finger: 1st string (high E), fret 2.',
      'Start the strum on the 4th string (D). Only play the thinnest 4 strings.',
    ],
    listenFor: 'The open D string is part of the chord. If the sound is muddy, make sure you are not accidentally hitting the low E or A strings.',
  },
  {
    chord: 'Dm', name: 'D minor', frets: ['x', 'x', 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], strumFrom: 4,
    steps: [
      'Index finger: 1st string (high E), fret 1.',
      'Middle finger: 3rd string (G), fret 2.',
      'Ring finger: 2nd string (B), fret 3.',
      'Start the strum on the 4th string (D).',
    ],
    listenFor: 'Keep the index finger close to fret 1 so the high E does not buzz.',
    connection: 'Compare it to D major: only one note changes, but the whole color turns darker.',
  },
  {
    chord: 'G', name: 'G major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], strumFrom: 6,
    steps: [
      'Middle finger: 6th string (low E), fret 3.',
      'Index finger: 5th string (A), fret 2.',
      'Ring finger: 1st string (high E), fret 3.',
      'Leave the middle three strings open and strum all 6.',
    ],
    listenFor: 'The open D, G, and B strings should ring. The stretch feels big at first; keep the thumb relaxed behind the neck.',
  },
  {
    chord: 'C', name: 'C major', frets: ['x', 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], strumFrom: 5,
    steps: [
      'Index finger: 2nd string (B), fret 1.',
      'Middle finger: 4th string (D), fret 2.',
      'Ring finger: 5th string (A), fret 3.',
      'Start the strum on the 5th string (A). Do not hit the thick low E.',
    ],
    listenFor: 'The open G and high E strings should ring. Curl the index and middle fingers so they do not touch their neighbors.',
    connection: 'A minor and C share two fingers. From Am, your index and middle can stay where they are while the ring finger moves.',
  },
  {
    chord: 'F', name: 'F major', frets: ['x', 'x', 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], strumFrom: 4,
    steps: [
      'Index finger: lightly flatten it across the 1st and 2nd strings at fret 1.',
      'Middle finger: 3rd string (G), fret 2.',
      'Ring finger: 4th string (D), fret 3.',
      'Strum only the thinnest 4 strings for now. You do not need the full six-string barre F yet.',
    ],
    listenFor: 'Both strings under the index finger need to ring. Roll the index slightly toward its bony outer edge if one is dead.',
    connection: 'This is the small beginner F. It is a real F chord without forcing you into a full barre chord too early.',
    beginnerVoicing: true,
  },
  {
    chord: 'B7', name: 'B7', frets: ['x', 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], strumFrom: 5,
    steps: [
      'Index finger: 4th string (D), fret 1.',
      'Middle finger: 5th string (A), fret 2.',
      'Ring finger: 3rd string (G), fret 2.',
      'Pinky: 1st string (high E), fret 2. Leave the B string open.',
      'Start your strum on the 5th string (A).',
    ],
    listenFor: 'The open B string is easy to mute accidentally. Keep the ring and pinky on their fingertips.',
    connection: 'B7 is the classic turnaround chord in an E blues. It sounds tense because it strongly wants to come back to E.',
  },
];

const BY_CHORD = new Map(SHAPES.map((shape) => [shape.chord, shape]));

export function chordShape(chord: string): ChordShape | null {
  return BY_CHORD.get(chord) ?? null;
}

export function beginnerChordShapes(): ChordShape[] {
  return [...SHAPES];
}

/** MIDI notes for the concrete beginner voicing in standard tuning. */
export function chordShapeMidis(shape: ChordShape): number[] {
  const open = [40, 45, 50, 55, 59, 64];
  return shape.frets.flatMap((fret, index) => fret === 'x' ? [] : [open[index]! + fret]);
}
