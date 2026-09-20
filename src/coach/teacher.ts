/**
 * Teacher-led Live Coach.
 *
 * Reactive analysis is useful after the player has something to play. Teaching
 * must work before that. These helpers choose a real next lesson and turn it
 * into a small musical application so the learner is never left with only an
 * isolated shape or definition.
 */

import type { PathProgress, PathStep } from '../curriculum/path.ts';
import { PATH } from '../curriculum/path.ts';
import type { SkillMastery } from '../curriculum/mastery.ts';
import { WORKABLE, levelOf } from '../curriculum/mastery.ts';

export interface TeacherChoice {
  step: PathStep;
  index: number;
  reason: string;
}

export interface MusicalUse {
  title: string;
  instruction: string;
  chords?: string[];
}

function pathChordSkill(step: PathStep): string | null {
  if (step.kind !== 'chord' || !step.chord) return null;
  return `chord.${step.chord}`;
}

/**
 * Prefer the fixed course's current step, but quietly skip chord lessons that
 * the microphone/history already says are usable. Non-chord physical/theory
 * steps still require an explicit completion because audio cannot honestly
 * infer them.
 */
export function chooseTeacherLesson(
  progress: PathProgress,
  mastery: Map<string, SkillMastery>,
): TeacherChoice {
  let index = Math.max(0, PATH.indexOf(progress.current));
  const hasPlayingEvidence = mastery.size > 0;

  while (index < PATH.length - 1) {
    const step = PATH[index]!;
    if (hasPlayingEvidence && ['hold', 'strings', 'fret'].includes(step.id)) {
      index += 1;
      continue;
    }
    if (progress.done.has(step.id)) {
      index += 1;
      continue;
    }

    const skillId = pathChordSkill(step);
    if (skillId && levelOf(mastery, skillId) >= WORKABLE) {
      index += 1;
      continue;
    }
    break;
  }

  const step = PATH[index]!;
  const reason = step.chord
    ? `This adds a sound your hand does not have reliably yet, and it builds directly on what comes before it.`
    : step.kind === 'scale'
      ? 'You have enough chord vocabulary now to start turning the fretboard into melody instead of more shapes.'
      : step.kind === 'technique'
        ? 'The next useful upgrade is not another chord — it is making the sounds you already have feel more musical.'
        : step.why;

  return { step, index, reason };
}

const STEP_USES: Record<string, MusicalUse> = {
  strum: {
    title: 'Make E minor breathe',
    instruction: 'Four even down-strums on E minor, then one beat of silence. Repeat it four times without letting the tempo speed up.',
    chords: ['Em'],
  },
  'strum-updown': {
    title: 'Turn the motion into a groove',
    instruction: 'On E minor, play steady down-up eighth notes for two bars. On the third bar, let one up-strum miss the strings so the groove suddenly has space.',
    chords: ['Em'],
  },
  change: {
    title: 'Make G → D feel like a sentence',
    instruction: 'G for four counts, D for four, repeat. Do not stop after a messy landing. The goal is continuity, not perfection.',
    chords: ['G', 'D'],
  },
  'strum-pattern': {
    title: 'Put the pattern on real harmony',
    instruction: 'Use down, down-up, up-down-up over G for one bar, C for one, D for one, then G for one. Keep the strumming hand moving through the missed beat.',
    chords: ['G', 'C', 'D', 'G'],
  },
  'change-a-e': {
    title: 'Make A → E sound like rock rhythm',
    instruction: 'Two bars of A, two bars of E. Use fewer, heavier strums on the first pass, then a lighter continuous pattern on the second.',
    chords: ['A', 'E'],
  },
  'boom-chuck': {
    title: 'Build a country heartbeat',
    instruction: 'On G: low bass note, light strum, A-string bass note, light strum. Four bars. Then keep the same bass-strum motion when you move to C.',
    chords: ['G', 'C'],
  },
  'clean-notes': {
    title: 'Turn picking practice into a melody',
    instruction: 'Pick three clean notes on one string, pause, then answer with three notes on the next string. Keep every attack separate and even.',
  },
  'hammer-on': {
    title: 'Make one note pull into the next',
    instruction: 'Take any two adjacent notes from your minor pentatonic shape. Pick the lower one once, hammer to the higher one, pause, then answer with one picked note somewhere lower.',
  },
  'pull-off': {
    title: 'Make the phrase fall back down',
    instruction: 'Pick the higher note, pull off to the lower note, then pause. Repeat it once, then end on a different lower note so the second phrase answers the first.',
  },
  bend: {
    title: 'Make the guitar actually sing',
    instruction: 'Play the target note first. Then bend up to it and hold it. Follow with one lower note and stop. The bend is the emotional event — do not bury it in a long lick.',
  },
  'first-riff': {
    title: 'Write four notes you can remember',
    instruction: 'Pick three or four scale notes. Play them twice. The second time, change only the rhythm or the final note. Save the version your ear prefers.',
  },
  'power-chords': {
    title: 'Move one shape and make a rock loop',
    instruction: 'Play A5, slide the whole shape to C5, then D5, then back to A5. Four strong hits on each before you try a faster rhythm.',
  },
  barre: {
    title: 'Use the barre as a movable chord',
    instruction: 'Once the shape rings, move the exact same grip from fret 1 to fret 3, then fret 5. The lesson is that the hand shape stays the same while the harmony moves.',
  },
  fingerpick: {
    title: 'Make one chord sound like several instruments',
    instruction: 'On E minor: thumb, index, middle, ring. Repeat it four times. Then move to G without stopping the picking pattern.',
    chords: ['Em', 'G'],
  },
  dynamics: {
    title: 'Give one progression an arc',
    instruction: 'Play G → C → D → G softly once. Repeat it louder. Third time, start soft and grow through the four chords. Same notes, completely different shape.',
    chords: ['G', 'C', 'D', 'G'],
  },
  'twelve-bar': {
    title: 'Feel the form instead of reading it',
    instruction: 'Play the twelve-bar once while saying the next chord before you arrive. The second time, stop looking at the screen and trust the form.',
    chords: ['A', 'D', 'E'],
  },
  ear: {
    title: 'Hunt, do not guess',
    instruction: 'Hum one note from a song you know. Find that pitch on the low two strings. Then test major versus minor and keep whichever one stops clashing.',
  },
  solo: {
    title: 'Say one thing, then leave space',
    instruction: 'Play a two- or three-note phrase over the first chord, leave a full beat of silence, then answer it when the harmony changes. Landing matters more than note count.',
  },
};

const CHORD_USES: Record<string, MusicalUse> = {
  Em: {
    title: 'Make your first groove',
    instruction: 'Hold E minor. Play four slow down-strums, leave one beat of silence, then do it again. The silence is part of the phrase.',
    chords: ['Em'],
  },
  G: {
    title: 'Hear the color change',
    instruction: 'Play E minor for four counts, then G for four. Do not chase speed. Listen to how the same open strings feel darker over E minor and brighter over G.',
    chords: ['Em', 'G'],
  },
  D: {
    title: 'Your first real two-chord loop',
    instruction: 'Play G for four counts, D for four counts, and repeat. Keep the pulse moving even if the chord change is ugly.',
    chords: ['G', 'D'],
  },
  C: {
    title: 'Turn three chords into music',
    instruction: 'Play G for four counts, C for four, D for four, then back to G. Listen to how D makes G feel like home when it returns.',
    chords: ['G', 'C', 'D', 'G'],
  },
  A: {
    title: 'A new chord family',
    instruction: 'Play D for four counts, A for four, then back to D. Listen for how A feels like it wants to return.',
    chords: ['D', 'A', 'D'],
  },
  E: {
    title: 'Major versus minor',
    instruction: 'Play E minor once, then E major once. Only one note changed. Listen to how violently the mood changes from one finger.',
    chords: ['Em', 'E'],
  },
  Dm: {
    title: 'Make the harmony turn darker',
    instruction: 'Play D major, then D minor. Keep the rhythm identical so your ear can focus entirely on the changed note.',
    chords: ['D', 'Dm'],
  },
  F: {
    title: 'Use F without fighting a full barre',
    instruction: 'Play C for four counts, small F for four, then back to C. Use only the four-string F you just learned.',
    chords: ['C', 'F', 'C'],
  },
  B7: {
    title: 'Hear tension actually work',
    instruction: 'Play E for four counts, B7 for four, then E again. B7 should sound unfinished until E returns.',
    chords: ['E', 'B7', 'E'],
  },
};

export function musicalUseFor(step: PathStep): MusicalUse | null {
  if (STEP_USES[step.id]) return STEP_USES[step.id]!;
  if (step.chord && CHORD_USES[step.chord]) return CHORD_USES[step.chord]!;
  if (step.scale) {
    return {
      title: 'Stop playing the scale like an exercise',
      instruction: 'Play only three notes from the shape. Repeat them. Change the final note the second time. That is already a riff.',
    };
  }
  if (step.kind === 'technique') {
    return {
      title: 'Use the move in music',
      instruction: `Do the technique for one minute, then immediately use it while playing a chord or phrase you already know. The technique only counts when it survives inside music.`,
    };
  }
  return null;
}
