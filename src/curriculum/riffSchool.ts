/**
 * Riff School: turn a scale shape into musical vocabulary.
 *
 * This is deliberately not a catalog of famous licks. Every study is built
 * from transferable musical devices: motif, repetition, space, contour,
 * rhythmic displacement, call/response, targeting and position movement.
 *
 * The generated pitch is paired with one concrete fretboard path so the player
 * can learn a physical route, while the rest of the app remains honest that a
 * microphone can verify pitch but cannot prove which duplicate fret produced it.
 */

import type { FretPosition, NoteEvent } from '../types.ts';
import type { Scale, ScaleBox, BoxPosition } from '../music/scales.ts';
import { degreeRole, rootPositionFret, scaleBox } from '../music/scales.ts';
import type { Tuning } from '../music/fretboard.ts';
import { midiToName, pcToName, pitchClass } from '../music/notes.ts';

export type RiffSchoolLevel = 'start' | 'connect' | 'create';

export interface RiffLesson {
  id: string;
  name: string;
  level: RiffSchoolLevel;
  focus: string;
  instruction: string;
  listenFor: string;
  /** Steps in the sorted scale ladder, relative to an anchor/root. */
  offsets: number[];
  /** Beats for each note. */
  rhythm: number[];
}

export interface NeckZone {
  index: number;
  id: string;
  startFret: number;
  highFret: number;
  anchorDegree: number;
  anchorName: string;
  box: ScaleBox;
}

export interface RiffStudy {
  lesson: RiffLesson;
  zone: NeckZone;
  events: NoteEvent[];
  positions: FretPosition[];
  noteNames: string[];
  roles: string[];
  /** Scale-ladder indexes used to construct the phrase. */
  ladderIndexes: number[];
}

export interface RootLocation {
  string: number;
  stringNumber: number;
  fret: number;
  midi: number;
  name: string;
}

export const RIFF_LESSONS: RiffLesson[] = [
  {
    id: 'home-neighbor',
    name: 'Home + Neighbor',
    level: 'start',
    focus: 'Hear home instead of seeing a box.',
    instruction: 'Keep returning to the root. The nearby notes are movement; home is the answer.',
    listenFor: 'Notice how the phrase stops sounding unfinished every time it comes back to home.',
    offsets: [0, 1, 0, 2, 1, 0],
    rhythm: [1, .5, .5, .75, .75, 1.5],
  },
  {
    id: 'motif-repeat',
    name: 'Motif, Then Change It',
    level: 'start',
    focus: 'Make a small shape memorable before adding notes.',
    instruction: 'Play the same three-note idea twice. The second time, change only the final note.',
    listenFor: 'Repetition tells the ear what matters; the changed ending creates development.',
    offsets: [0, 1, 2, 0, 1, 3, 2, 0],
    rhythm: [.5, .5, 1, .5, .5, 1, .5, 1.5],
  },
  {
    id: 'space',
    name: 'Leave the Hole',
    level: 'start',
    focus: 'Treat silence as part of the riff.',
    instruction: 'Let the longer notes breathe. Do not fill every gap just because another scale note exists.',
    listenFor: 'The held notes create shape. The phrase sounds larger even though it uses fewer attacks.',
    offsets: [0, 2, 3, 2, 0, 1, 0],
    rhythm: [1, .5, 1.5, .5, 1, .5, 2],
  },
  {
    id: 'skip',
    name: 'Stop Sounding Like a Scale',
    level: 'connect',
    focus: 'Use skips so the line has contour.',
    instruction: 'Jump over a scale note, then fill part of the gap. The ear hears a shape instead of an exercise.',
    listenFor: 'The wider jumps are the memorable moments; the small steps around them make the jumps feel intentional.',
    offsets: [0, 2, 1, 3, 2, 4, 2, 0],
    rhythm: [.5, .5, .5, .75, .25, .5, .5, 1.5],
  },
  {
    id: 'call-response',
    name: 'Question / Answer',
    level: 'connect',
    focus: 'Phrase like speech.',
    instruction: 'The first four notes ask. The second half answers by moving in the opposite direction.',
    listenFor: 'A short pause or held note between halves makes the conversation obvious.',
    offsets: [0, 1, 3, 2, 4, 3, 1, 0],
    rhythm: [.5, .5, 1, 1.25, .5, .5, .75, 1.5],
  },
  {
    id: 'push',
    name: 'Push Before the Beat',
    level: 'connect',
    focus: 'Make rhythm identify the riff.',
    instruction: 'The opening notes are short and impatient; the long note is the landing.',
    listenFor: 'Keep the pitches exactly the same and alter only the rhythm later — it should become a different idea.',
    offsets: [1, 2, 0, 3, 2, 4, 2, 0],
    rhythm: [.25, .25, 1, .5, .5, .5, .5, 1.5],
  },
  {
    id: 'sequence',
    name: 'Move the Shape',
    level: 'create',
    focus: 'Sequence a motif through the scale.',
    instruction: 'Play a three-note shape, then start the same contour one scale step higher.',
    listenFor: 'The second group feels related even though every pitch changed. That is a songwriting tool, not just a soloing trick.',
    offsets: [0, 1, 2, 1, 2, 3, 2, 3, 4, 2, 0],
    rhythm: [.5, .5, 1, .5, .5, 1, .5, .5, 1, .5, 1.5],
  },
  {
    id: 'delay-home',
    name: 'Delay the Answer',
    level: 'create',
    focus: 'Create tension by postponing the obvious landing.',
    instruction: 'Circle around home and save the root for the last note.',
    listenFor: 'The longer you avoid home, the more meaningful the final root sounds.',
    offsets: [2, 3, 4, 2, 3, 1, 2, 1, 0],
    rhythm: [.5, .5, .5, .5, .75, .25, .5, .5, 1.5],
  },
];

function pc(value: number): number {
  return ((value % 12) + 12) % 12;
}

/**
 * Fretboard "zones" are overlapping hand-sized windows beginning on each scale
 * tone found on the low string, starting from the first tonic.
 *
 * These are intentionally called zones rather than claiming to be canonical
 * CAGED/box numbers. They teach the more important thing first: the same sound
 * exists in connected neighborhoods all the way up the neck.
 */
export function neckZones(
  tonicPc: number,
  scale: Scale,
  tuning: Tuning,
  maxFret = 22,
): NeckZone[] {
  const rootFret = rootPositionFret(tonicPc, tuning);
  const starts = scale.degrees
    .map((degree) => ({ degree, fret: rootFret + degree }))
    .filter(({ fret }) => fret <= maxFret - 2);

  return starts.map(({ degree, fret }, index) => {
    const box = scaleBox(tonicPc, scale, tuning, fret, 4);
    return {
      index,
      id: `zone-${index + 1}`,
      startFret: fret,
      highFret: box.highFret,
      anchorDegree: degree,
      anchorName: pcToName((tonicPc + degree) % 12),
      box,
    };
  });
}

export function rootLocations(
  tonicPc: number,
  tuning: Tuning,
  maxFret = 12,
): RootLocation[] {
  const out: RootLocation[] = [];
  tuning.strings.forEach((open, string) => {
    for (let fret = 0; fret <= maxFret; fret++) {
      const midi = open + fret;
      if (pitchClass(midi) !== pc(tonicPc)) continue;
      out.push({
        string,
        stringNumber: tuning.strings.length - string,
        fret,
        midi,
        name: midiToName(midi),
      });
    }
  });
  return out;
}

function uniqueLadder(box: ScaleBox): Array<{ midi: number; positions: BoxPosition[] }> {
  const grouped = new Map<number, BoxPosition[]>();
  for (const position of box.positions) {
    const list = grouped.get(position.midi) ?? [];
    list.push(position);
    grouped.set(position.midi, list);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([midi, positions]) => ({ midi, positions }));
}

function travelCost(position: BoxPosition, previous: FretPosition | null, centerFret: number): number {
  let score = Math.abs(position.fret - centerFret) * .08;
  if (!previous) return score;
  score += Math.abs(position.fret - previous.fret) * .7;
  score += Math.abs(position.string - previous.string) * .35;
  return score;
}

function choosePosition(
  candidates: BoxPosition[],
  previous: FretPosition | null,
  centerFret: number,
): BoxPosition {
  return candidates.reduce((best, candidate) =>
    travelCost(candidate, previous, centerFret) < travelCost(best, previous, centerFret)
      ? candidate
      : best,
  candidates[0]!);
}

function anchorIndex(ladder: Array<{ midi: number }>, tonicPc: number, needed: number): number {
  const roots = ladder
    .map((entry, index) => ({ index, root: pitchClass(entry.midi) === pc(tonicPc) }))
    .filter((entry) => entry.root)
    .map((entry) => entry.index);

  const fitting = roots.find((index) => index + needed < ladder.length);
  if (fitting !== undefined) return fitting;
  if (roots.length) return Math.max(0, Math.min(roots[0]!, ladder.length - needed - 1));
  return 0;
}

export function buildRiffStudy(
  lesson: RiffLesson,
  zone: NeckZone,
  tonicPc: number,
  scale: Scale,
  bpm = 88,
): RiffStudy {
  const ladder = uniqueLadder(zone.box);
  if (!ladder.length) {
    return { lesson, zone, events: [], positions: [], noteNames: [], roles: [], ladderIndexes: [] };
  }

  const maxOffset = Math.max(...lesson.offsets, 0);
  const anchor = anchorIndex(ladder, tonicPc, maxOffset);
  const indexes = lesson.offsets.map((offset) =>
    Math.max(0, Math.min(ladder.length - 1, anchor + offset)));

  const beatMs = 60_000 / bpm;
  let at = 0;
  let previous: FretPosition | null = null;
  const positions: FretPosition[] = [];
  const events: NoteEvent[] = [];
  const roles: string[] = [];
  const center = (zone.startFret + zone.highFret) / 2;

  indexes.forEach((index, i) => {
    const item = ladder[index]!;
    const exact = choosePosition(item.positions, previous, center);
    const position = { string: exact.string, fret: exact.fret };
    previous = position;
    positions.push(position);

    const beats = lesson.rhythm[i] ?? .5;
    events.push({
      midi: item.midi,
      startMs: at,
      durationMs: Math.max(110, beatMs * beats * .85),
      confidence: 1,
      velocity: .62,
    });
    at += beatMs * beats;

    const degree = pc(pitchClass(item.midi) - tonicPc);
    roles.push(degreeRole(degree).short);
  });

  return {
    lesson,
    zone,
    events,
    positions,
    noteNames: events.map((event) => midiToName(event.midi)),
    roles,
    ladderIndexes: indexes,
  };
}

/** Same musical device in another connected neck zone. */
export function moveStudy(
  study: RiffStudy,
  toZone: NeckZone,
  tonicPc: number,
  scale: Scale,
  bpm = 88,
): RiffStudy {
  return buildRiffStudy(study.lesson, toZone, tonicPc, scale, bpm);
}

export type DevelopmentKind = 'rhythm' | 'ending' | 'space' | 'register';

export interface DevelopedRiff {
  kind: DevelopmentKind;
  label: string;
  why: string;
  events: NoteEvent[];
}

/**
 * Songwriting transformations: change one dimension, keep the identity.
 * This is the smallest useful model of motif development.
 */
export function developStudy(
  study: RiffStudy,
  scale: Scale,
  tonicPc: number,
): DevelopedRiff[] {
  if (study.events.length < 3) return [];
  const original = study.events;

  const rebuildTiming = (events: NoteEvent[], beats: number[]): NoteEvent[] => {
    const baseGap = original.length >= 2
      ? Math.max(180, original[1]!.startMs - original[0]!.startMs)
      : 500;
    let at = 0;
    return events.map((event, i) => {
      const beat = beats[i] ?? 1;
      const next = { ...event, startMs: at, durationMs: Math.max(110, baseGap * beat * .82) };
      at += baseGap * beat;
      return next;
    });
  };

  const rhythm = rebuildTiming(
    original,
    original.map((_, i) => i % 3 === 0 ? .5 : i % 3 === 1 ? .5 : 1.25),
  );

  const landingPc = scale.degrees.includes(7) ? (tonicPc + 7) % 12 : tonicPc;
  const final = original[original.length - 1]!;
  let landing = final.midi;
  for (let delta = 0; delta <= 12; delta++) {
    for (const sign of [1, -1]) {
      const candidate = final.midi + delta * sign;
      if (candidate >= 40 && candidate <= 88 && pitchClass(candidate) === pc(landingPc)) {
        landing = candidate;
        break;
      }
    }
    if (landing !== final.midi) break;
  }
  const ending = original.map((event, i) =>
    i === original.length - 1 ? { ...event, midi: landing } : { ...event });

  const removeIndex = Math.max(1, Math.floor(original.length / 2) - 1);
  const spacedRaw = original.filter((_, i) => i !== removeIndex).map((event) => ({ ...event }));
  const spaced = rebuildTiming(spacedRaw, spacedRaw.map(() => 1));

  const lifted = original.map((event, i) => {
    if (i < Math.floor(original.length / 2)) return { ...event };
    const candidate = event.midi + 12;
    return { ...event, midi: candidate <= 88 ? candidate : event.midi };
  });

  return [
    {
      kind: 'rhythm',
      label: 'Same notes · new rhythm',
      why: 'The pitches stay put. If it suddenly feels like a different riff, you just heard how much identity lives in rhythm.',
      events: rhythm,
    },
    {
      kind: 'ending',
      label: 'Same phrase · open ending',
      why: 'Only the final destination changes. Ending away from home can make the next bar feel necessary.',
      events: ending,
    },
    {
      kind: 'space',
      label: 'Take one note out',
      why: 'Removing information creates phrasing. Space can make the notes around it sound more intentional.',
      events: spaced,
    },
    {
      kind: 'register',
      label: 'Lift the second half',
      why: 'The idea stays recognizable, but a register change makes the second half feel larger — a simple way to build a section.',
      events: lifted,
    },
  ];
}
