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
  chord: string;
  name: string;
  /** Low E → high E. 0=open, x=do not play. */
  frets: [Fret, Fret, Fret, Fret, Fret, Fret];
  /** Low E → high E. 1=index, 2=middle, 3=ring, 4=pinky, 0=open/muted. */
  fingers: [Finger, Finger, Finger, Finger, Finger, Finger];
  /** First string to strum, where 6 is the thick low E and 1 is the thin high E. */
  strumFrom: 1 | 2 | 3 | 4 | 5 | 6;
  steps: string[];
  listenFor: string;
  connection?: string;
  beginnerVoicing?: boolean;
}

const SHAPES: ChordShape[] = [
  {
    chord: 'Em', name: 'E minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], strumFrom: 6,
    steps: ['Middle finger: 5th string (A), fret 2.', 'Ring finger: 4th string (D), fret 2.', 'Leave every other string open and strum all 6 strings.'],
    listenFor: 'All six strings should ring. If one of the middle strings is dead, arch those two fretting fingers a little more.',
    connection: 'This is one of the simplest full chords on guitar: two fingers, all six strings.',
  },
  {
    chord: 'E', name: 'E major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], strumFrom: 6,
    steps: ['Middle finger: 5th string (A), fret 2.', 'Ring finger: 4th string (D), fret 2.', 'Index finger: 3rd string (G), fret 1.', 'Strum all 6 strings.'],
    listenFor: 'The open B and high E strings should still ring clearly under your index finger.',
    connection: 'It is E minor plus one finger: put your index on the G string, fret 1.',
  },
  {
    chord: 'Em7', name: 'E minor 7', frets: [0, 2, 2, 0, 3, 0], fingers: [0, 2, 3, 0, 4, 0], strumFrom: 6,
    steps: ['Start with your E minor shape.', 'Add your pinky to the 2nd string (B), fret 3.', 'Strum all 6 strings and let the open strings ring around it.'],
    listenFor: 'The high E should stay open. If it disappears, curl the pinky more.',
    connection: 'It is literally E minor with one extra color note. Compare them back to back.',
  },
  {
    chord: 'E7', name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], strumFrom: 6,
    steps: ['Index finger: 3rd string (G), fret 1.', 'Middle finger: 5th string (A), fret 2.', 'Leave the D, B and high E strings open and strum all 6.'],
    listenFor: 'It should sound more tense than E major — like it wants to move somewhere.',
    connection: 'Take E major and lift your ring finger off the D string. That one open string changes the whole function.',
  },
  {
    chord: 'Am', name: 'A minor', frets: ['x', 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], strumFrom: 5,
    steps: ['Index finger: 2nd string (B), fret 1.', 'Middle finger: 4th string (D), fret 2.', 'Ring finger: 3rd string (G), fret 2.', 'Start your strum on the 5th string (A). Do not hit the thick low E string.'],
    listenFor: 'The thin high E string should ring open. If it is muted, curl your index finger more.',
    connection: 'The shape feels a lot like E major moved one string toward the floor.',
  },
  {
    chord: 'Am7', name: 'A minor 7', frets: ['x', 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], strumFrom: 5,
    steps: ['Index finger: 2nd string (B), fret 1.', 'Middle finger: 4th string (D), fret 2.', 'Leave the G and high E strings open.', 'Start on the 5th string (A).'],
    listenFor: 'The open G is the color note here. Make sure your middle finger does not mute it.',
    connection: 'Take A minor and lift your ring finger. That is the whole move.',
  },
  {
    chord: 'A', name: 'A major', frets: ['x', 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], strumFrom: 5,
    steps: ['Index finger: 4th string (D), fret 2.', 'Middle finger: 3rd string (G), fret 2.', 'Ring finger: 2nd string (B), fret 2.', 'Start on the 5th string (A) and leave the thin high E open.'],
    listenFor: 'Three fingers share fret 2, so keep them narrow and on their fingertips so the high E keeps ringing.',
  },
  {
    chord: 'A7', name: 'A7', frets: ['x', 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], strumFrom: 5,
    steps: ['Middle finger: 4th string (D), fret 2.', 'Ring finger: 2nd string (B), fret 2.', 'Leave the A, G and high E strings open.', 'Start your strum on the 5th string (A).'],
    listenFor: 'The open G is important. If it is muted, separate the two fretting fingers a little.',
    connection: 'It is A major with the middle note opened up. Hear how it suddenly wants to move.',
  },
  {
    chord: 'Asus2', name: 'A suspended 2', frets: ['x', 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], strumFrom: 5,
    steps: ['Index finger: 4th string (D), fret 2.', 'Middle finger: 3rd string (G), fret 2.', 'Leave both top strings open.', 'Start on the 5th string (A).'],
    listenFor: 'It should sound open and unresolved rather than clearly happy or sad.',
    connection: 'Start with A major and lift the finger that was on the B string.',
  },
  {
    chord: 'D', name: 'D major', frets: ['x', 'x', 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], strumFrom: 4,
    steps: ['Index finger: 3rd string (G), fret 2.', 'Ring finger: 2nd string (B), fret 3.', 'Middle finger: 1st string (high E), fret 2.', 'Start the strum on the 4th string (D). Only play the thinnest 4 strings.'],
    listenFor: 'The open D string is part of the chord. If the sound is muddy, make sure you are not accidentally hitting the low E or A strings.',
  },
  {
    chord: 'D7', name: 'D7', frets: ['x', 'x', 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], strumFrom: 4,
    steps: ['Index finger: 2nd string (B), fret 1.', 'Middle finger: 3rd string (G), fret 2.', 'Ring finger: 1st string (high E), fret 2.', 'Start on the open D string.'],
    listenFor: 'The little triangle should sound tense and bluesy, not as settled as D major.',
    connection: 'Compare D and D7. Two fingers trade places and the mood changes immediately.',
  },
  {
    chord: 'Dsus2', name: 'D suspended 2', frets: ['x', 'x', 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0], strumFrom: 4,
    steps: ['Index finger: 3rd string (G), fret 2.', 'Ring finger: 2nd string (B), fret 3.', 'Leave the high E string open.', 'Start on the open D string.'],
    listenFor: 'The open high E should ring clearly and make the chord feel unfinished in a good way.',
    connection: 'Take D major and lift the finger from the high E string. That is Dsus2.',
  },
  {
    chord: 'Dm', name: 'D minor', frets: ['x', 'x', 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], strumFrom: 4,
    steps: ['Index finger: 1st string (high E), fret 1.', 'Middle finger: 3rd string (G), fret 2.', 'Ring finger: 2nd string (B), fret 3.', 'Start the strum on the 4th string (D).'],
    listenFor: 'Keep the index finger close to fret 1 so the high E does not buzz.',
    connection: 'Compare it to D major: only one note changes, but the whole color turns darker.',
  },
  {
    chord: 'G', name: 'G major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], strumFrom: 6,
    steps: ['Middle finger: 6th string (low E), fret 3.', 'Index finger: 5th string (A), fret 2.', 'Ring finger: 1st string (high E), fret 3.', 'Leave the middle three strings open and strum all 6.'],
    listenFor: 'The open D, G, and B strings should ring. The stretch feels big at first; keep the thumb relaxed behind the neck.',
  },
  {
    chord: 'G7', name: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], strumFrom: 6,
    steps: ['Ring finger: 6th string (low E), fret 3.', 'Middle finger: 5th string (A), fret 2.', 'Index finger: 1st string (high E), fret 1.', 'Leave D, G and B open and strum all 6.'],
    listenFor: 'That high F on the first fret should sound deliciously unresolved.',
    connection: 'It feels like G major with the top note pulled down two frets. Great for blues and country movement.',
  },
  {
    chord: 'C', name: 'C major', frets: ['x', 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], strumFrom: 5,
    steps: ['Index finger: 2nd string (B), fret 1.', 'Middle finger: 4th string (D), fret 2.', 'Ring finger: 5th string (A), fret 3.', 'Start the strum on the 5th string (A). Do not hit the thick low E.'],
    listenFor: 'The open G and high E strings should ring. Curl the index and middle fingers so they do not touch their neighbors.',
    connection: 'A minor and C share two fingers. From Am, your index and middle can stay where they are while the ring finger moves.',
  },
  {
    chord: 'Cmaj7', name: 'C major 7', frets: ['x', 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], strumFrom: 5,
    steps: ['Ring finger: 5th string (A), fret 3.', 'Middle finger: 4th string (D), fret 2.', 'Leave G, B and high E open.', 'Start on the 5th string (A).'],
    listenFor: 'The open B gives it the dreamy major-7 color. Let the top three strings ring.',
    connection: 'Take C major and lift your index finger. That single open string makes it feel much more spacious.',
  },
  {
    chord: 'F', name: 'F major', frets: ['x', 'x', 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], strumFrom: 4,
    steps: ['Index finger: lightly flatten it across the 1st and 2nd strings at fret 1.', 'Middle finger: 3rd string (G), fret 2.', 'Ring finger: 4th string (D), fret 3.', 'Strum only the thinnest 4 strings for now. You do not need the full six-string barre F yet.'],
    listenFor: 'Both strings under the index finger need to ring. Roll the index slightly toward its bony outer edge if one is dead.',
    connection: 'This is the small beginner F. It is a real F chord without forcing you into a full barre chord too early.',
    beginnerVoicing: true,
  },
  {
    chord: 'B7', name: 'B7', frets: ['x', 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], strumFrom: 5,
    steps: ['Index finger: 4th string (D), fret 1.', 'Middle finger: 5th string (A), fret 2.', 'Ring finger: 3rd string (G), fret 2.', 'Pinky: 1st string (high E), fret 2. Leave the B string open.', 'Start your strum on the 5th string (A).'],
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
