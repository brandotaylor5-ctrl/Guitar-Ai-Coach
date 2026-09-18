/**
 * A lead line over a chord loop.
 *
 * Built out of the view it used to live in, because improvising over changes
 * is worth far more attached to a real song than stranded in a sandbox. The
 * rule it follows is the one a teacher gives first: land on a note that
 * belongs to the chord you are currently on. That single habit is most of
 * what separates a solo from running a scale over the top of a song.
 */

import type { NoteEvent } from '../types.ts';

/** A chord in a loop, reduced to what a lead line needs to know about it. */
export interface LeadChord {
  label: string;
  rootPc: number;
  minor: boolean;
}

export function leadOverProgression(chords: LeadChord[], scale: number[], variant = 0, barMs = 1050): NoteEvent[] {
  const out: NoteEvent[] = [];
  const scalePitchClasses = new Set(scale.map((midi) => midi % 12));
  let around = variant === 1 ? 64 : variant === 2 ? 52 : 57;

  /**
   * Play the nearest instance of one of these pitch classes, in preference
   * order.
   *
   * The order matters because a chord's root is often not in the scale you
   * are soloing in — over a C chord in G major pentatonic there is no C at
   * all. Falling back to whatever scale note happened to be nearest gave a
   * line that missed the chord entirely; falling back to another note of the
   * same chord keeps the one rule this is here to teach.
   */
  const pick = (...preferred: number[]): number => {
    for (const pitchClass of preferred) {
      const candidates = scale.filter((midi) => midi % 12 === pitchClass);
      if (!candidates.length) continue;
      const midi = candidates.sort((a, b) => Math.abs(a - around) - Math.abs(b - around))[0]!;
      around = midi;
      return midi;
    }
    const midi = scale.slice().sort((a, b) => Math.abs(a - around) - Math.abs(b - around))[0]!;
    around = midi;
    return midi;
  };

  chords.forEach((chord, index) => {
    const third = (chord.rootPc + (chord.minor ? 3 : 4)) % 12;
    const fifth = (chord.rootPc + 7) % 12;
    const chordTone = scalePitchClasses.has(third) ? third : fifth;
    const targets = variant === 1
      ? [chordTone, fifth]
      : variant === 2
        ? [fifth, chord.rootPc]
        : [chord.rootPc, chordTone];

    // Every chord tone, so a root that is missing from the scale falls back
    // to the third or fifth rather than to whatever was nearest.
    const tones = [chord.rootPc, chordTone, fifth, third];
    targets.forEach((pitchClass, targetIndex) => {
      const offset = variant === 2 && targetIndex === 1 ? .68 : targetIndex * .5;
      out.push({
        midi: pick(pitchClass, ...tones),
        startMs: index * barMs + offset * barMs,
        durationMs: barMs * (variant === 2 ? .26 : .38),
        confidence: 1,
        velocity: .62,
      });
    });
  });
  return out;
}

const PITCH_CLASSES: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

/** The root of a chord symbol or key name, or null if it is not one. */
export function pitchClassOf(symbol: string): number | null {
  const root = symbol.match(/^[A-G]#?/)?.[0];
  return root === undefined ? null : PITCH_CLASSES[root] ?? null;
}

/**
 * A run of bars reduced to the chords a lead line has to follow.
 *
 * Repeats collapse, because four bars of G is one chord to play over, not
 * four. The minor test has to skip the m in "maj7" — a Cmaj7 is about as
 * major as a chord gets, and a lead that treats it as minor will hit a flat
 * third over it every time.
 */
export function leadChords(bars: string[]): LeadChord[] {
  const out: LeadChord[] = [];
  for (const label of bars) {
    if (out[out.length - 1]?.label === label) continue;
    const rootPc = pitchClassOf(label);
    if (rootPc === null) continue;
    out.push({ label, rootPc, minor: /m(?!aj)/.test(label) });
  }
  return out;
}
