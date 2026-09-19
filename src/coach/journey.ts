/**
 * The map around the lesson.
 *
 * A learner needs two scales of direction at once:
 *   1. What exactly am I doing right now?
 *   2. What larger kind of guitarist is this building me toward?
 *
 * This module provides both without turning the app into a dashboard.
 */

import type { PathProgress, PathStep } from '../curriculum/path.ts';
import { PATH } from '../curriculum/path.ts';
import type { SkillMastery } from '../curriculum/mastery.ts';
import { WORKABLE, levelOf } from '../curriculum/mastery.ts';
import { SKILLS } from '../curriculum/skills.ts';

export interface JourneyStage {
  id: string;
  name: string;
  promise: string;
  from: string;
  through: string;
}

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: 'foundation',
    name: 'Foundations',
    promise: 'Make clean sounds, hold chords, and stay in time.',
    from: 'hold',
    through: 'first-song',
  },
  {
    id: 'rhythm',
    name: 'Rhythm & Songs',
    promise: 'Turn chord shapes into grooves and complete songs.',
    from: 'strum-pattern',
    through: 'clean-notes',
  },
  {
    id: 'fretboard',
    name: 'Fretboard',
    promise: 'See where melody lives instead of memorizing isolated dots.',
    from: 'scale-minor-pent',
    through: 'scale-blues',
  },
  {
    id: 'lead',
    name: 'Lead Guitar',
    promise: 'Use phrasing, articulation, bends, and riffs to say something.',
    from: 'bend',
    through: 'first-riff',
  },
  {
    id: 'whole-guitar',
    name: 'Whole Guitar',
    promise: 'Move shapes, fingerpick, control dynamics, and own common forms.',
    from: 'chord-f-small',
    through: 'twelve-bar',
  },
  {
    id: 'musician',
    name: 'Musician',
    promise: 'Hear music, work it out, improvise, and make your own decisions.',
    from: 'ear',
    through: 'solo',
  },
];

export interface JourneyStatus {
  stage: JourneyStage;
  stageIndex: number;
  lessonIndex: number;
  lessonNumber: number;
  totalLessons: number;
  completedLessons: number;
  stageCompleted: number;
  stageTotal: number;
  stageFraction: number;
  overallFraction: number;
}

function indexOfStep(id:string):number {
  return Math.max(0, PATH.findIndex((step) => step.id === id));
}

export function stageForStep(step:PathStep):JourneyStage {
  const index = indexOfStep(step.id);
  return JOURNEY_STAGES.find((stage) => {
    const start = indexOfStep(stage.from);
    const end = indexOfStep(stage.through);
    return index >= start && index <= end;
  }) ?? JOURNEY_STAGES[JOURNEY_STAGES.length - 1]!;
}

export function journeyStatus(progress:PathProgress, step:PathStep = progress.current):JourneyStatus {
  const lessonIndex = indexOfStep(step.id);
  const stage = stageForStep(step);
  const stageIndex = JOURNEY_STAGES.indexOf(stage);
  const stageStart = indexOfStep(stage.from);
  const stageEnd = indexOfStep(stage.through);
  const stageIds = PATH.slice(stageStart, stageEnd + 1).map((item) => item.id);
  const stageCompleted = stageIds.filter((id) => progress.done.has(id)).length;
  const stageTotal = stageIds.length;

  return {
    stage,
    stageIndex,
    lessonIndex,
    lessonNumber: lessonIndex + 1,
    totalLessons: PATH.length,
    completedLessons: progress.completed,
    stageCompleted,
    stageTotal,
    stageFraction: stageTotal ? stageCompleted / stageTotal : 0,
    overallFraction: PATH.length ? progress.completed / PATH.length : 0,
  };
}

function knownChords(mastery:Map<string, SkillMastery>):string[] {
  return SKILLS
    .filter((skill) => skill.kind === 'chord' && skill.chord && levelOf(mastery, skill.id) >= WORKABLE)
    .map((skill) => skill.chord!);
}

export interface Warmup {
  title: string;
  instruction: string;
  chords: string[];
  minutes: number;
}

export function warmupFor(mastery:Map<string, SkillMastery>):Warmup {
  const known = knownChords(mastery);
  if (known.includes('G') && known.includes('D')) {
    return {
      title: 'Wake up the G → D change',
      instruction: 'Four slow strums of G, four of D. Keep moving through ugly landings instead of stopping to repair them.',
      chords: ['G', 'D'],
      minutes: 2,
    };
  }
  if (known.length >= 2) {
    const [a, b] = known;
    return {
      title: `Wake up ${a} → ${b}`,
      instruction: `Four slow strums of ${a}, then four of ${b}. Relax the hand between changes and keep the pulse moving.`,
      chords: [a!, b!],
      minutes: 2,
    };
  }
  if (known.length === 1) {
    return {
      title: `Rebuild ${known[0]} without staring`,
      instruction: `Strum ${known[0]} once, take the whole hand off the neck, rebuild it, and strum again. Five calm repetitions.`,
      chords: [known[0]!],
      minutes: 2,
    };
  }
  return {
    title: 'Wake up both hands',
    instruction: 'Play each open string from thickest to thinnest and back. Then fret 1, 2, 3, 4 on one string, slowly and cleanly.',
    chords: [],
    minutes: 2,
  };
}

export interface GuidedSessionPlan {
  totalMinutes: number;
  warmup: Warmup;
  newThing: PathStep;
  learnMinutes: number;
  musicMinutes: number;
  playMinutes: number;
  finishPrompt: string;
}

export function guidedSessionPlan(
  step:PathStep,
  mastery:Map<string, SkillMastery>,
):GuidedSessionPlan {
  const status = stageForStep(step);
  const finishPrompt = status.id === 'foundation'
    ? 'Use the new thing at least once while you play. Do not stop for mistakes.'
    : status.id === 'rhythm'
      ? 'Keep one groove going and change only one thing: chord, accent, or strum.'
      : status.id === 'fretboard'
        ? 'Make a three-note idea, repeat it, and change the final note.'
        : status.id === 'lead'
          ? 'Play one short phrase, leave space, then answer it.'
          : status.id === 'whole-guitar'
            ? 'Use the new technique inside something you already know instead of drilling it alone.'
            : 'Make one musical decision by ear and commit to it for a full phrase.';

  return {
    totalMinutes: 15,
    warmup: warmupFor(mastery),
    newThing: step,
    learnMinutes: 6,
    musicMinutes: 4,
    playMinutes: 3,
    finishPrompt,
  };
}
