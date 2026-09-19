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
  if (!step.chord) return null;
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
