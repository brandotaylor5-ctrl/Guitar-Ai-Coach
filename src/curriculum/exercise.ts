/**
 * Turning a skill into something to actually do, and judging the attempt.
 *
 * Grading is deliberately generous about the things that do not matter and
 * strict about the one that does. A beginner strumming a progression will be
 * late, early, and uneven; what decides whether they are learning is whether
 * the right chord arrived in the right bar. Marking them down for the rest
 * teaches them to be careful instead of musical.
 */

import type { Skill } from './skills.ts';
import { FLUENT_CHANGES_PER_MINUTE } from './skills.ts';
import type { Observation } from './mastery.ts';

export type ExerciseKind = 'hold-chord' | 'change-drill' | 'play-progression' | 'play-scale' | 'keep-time';

export interface Exercise {
  skillId: string;
  kind: ExerciseKind;
  title: string;
  /** What to do, said the way a teacher would say it. */
  instructions: string;
  /** Beats per minute to play along at. */
  bpm: number;
  /** How long the attempt should run. */
  durationMs: number;
  /** For changes and progressions: the chords, in order, one per bar. */
  chords?: string[];
  /** What counts as passing, in the player's terms. */
  target: string;
}

/** A chord heard during an attempt. */
export interface HeardChord {
  label: string;
  at: number;
}

export interface Grade {
  /** 0..1. */
  quality: number;
  passed: boolean;
  /** What to say about it — leads with what went right. */
  feedback: string[];
  changesPerMinute?: number;
}

export function buildExercise(skill: Skill, bpm = 70): Exercise {
  const base = { skillId: skill.id, bpm };

  if (skill.kind === 'chord' && skill.chord) {
    return {
      ...base, kind: 'hold-chord', title: `Hold ${skill.name}`,
      durationMs: 20_000,
      instructions: `Get the shape down, then strum slowly and let it ring. I am listening for whether every string speaks.`,
      chords: [skill.chord],
      target: 'Four clean strums in a row.',
    };
  }

  if (skill.kind === 'change' && skill.between) {
    const [from, to] = skill.between;
    return {
      ...base, kind: 'change-drill', title: `${from} to ${to}`,
      durationMs: 60_000, bpm: 60,
      instructions: `One strum on ${from}, one on ${to}, and keep going. Do not stop to fix a bad one — leave it and carry on. Speed comes from repetition, not from care.`,
      chords: [from, to],
      target: `${FLUENT_CHANGES_PER_MINUTE} clean changes in a minute.`,
    };
  }

  if (skill.kind === 'progression' && skill.sequence) {
    return {
      ...base, kind: 'play-progression', title: skill.name,
      durationMs: skill.sequence.length * 4 * (60_000 / bpm) * 2,
      instructions: `One bar each, round and round. If you lose it, come back in at the top rather than stopping.`,
      chords: skill.sequence,
      target: 'Two times round without losing your place.',
    };
  }

  if (skill.kind === 'scale') {
    return {
      ...base, kind: 'play-scale', title: skill.name, bpm: 60,
      durationMs: 30_000,
      instructions: `Up and down, one note per beat. Evenly is better than quickly.`,
      target: 'Up and down twice, every note sounding.',
    };
  }

  return {
    ...base, kind: 'keep-time', title: skill.name,
    durationMs: 60_000,
    instructions: `Strum one chord on every beat and hold the pulse. I am only listening to your timing here, not your chord.`,
    target: 'A minute without drifting.',
  };
}

/**
 * Grade a change drill the way a teacher counts it: clean changes per minute.
 *
 * The standard measure, and the one that actually predicts whether somebody
 * can play a song — it rewards keeping going rather than getting each one
 * perfect, which is the habit that makes changes fast.
 */
export function gradeChangeDrill(
  exercise: Exercise,
  heard: HeardChord[],
  elapsedMs: number,
): Grade {
  const [from, to] = exercise.chords ?? [];
  if (!from || !to) return { quality: 0, passed: false, feedback: ['That drill has no chords set.'] };
  if (heard.length < 2) {
    return { quality: 0, passed: false, feedback: ['I did not hear enough to count. Strum a little harder or move closer.'] };
  }

  let changes = 0;
  let wrong = 0;
  for (let i = 1; i < heard.length; i++) {
    const previous = heard[i - 1]!.label;
    const current = heard[i]!.label;
    if (previous === current) continue;
    const expected = (previous === from && current === to) || (previous === to && current === from);
    if (expected) changes++;
    else wrong++;
  }

  const minutes = Math.max(elapsedMs / 60_000, 1 / 60);
  const changesPerMinute = Math.round(changes / minutes);
  const quality = Math.max(0, Math.min(1, changesPerMinute / FLUENT_CHANGES_PER_MINUTE));

  // Counting inside a fixed window always loses the change that was halfway
  // through when time ran out, so somebody playing exactly at the target comes
  // out one short. A player should not fail on an artefact of the counting.
  const fluent = changesPerMinute >= FLUENT_CHANGES_PER_MINUTE - 2;

  const feedback: string[] = [];
  feedback.push(`${changes} clean changes — that is ${changesPerMinute} a minute.`);
  if (fluent) {
    feedback.push('That is fluent. This change is yours; you can stop drilling it and start using it.');
  } else if (changesPerMinute >= FLUENT_CHANGES_PER_MINUTE * 0.6) {
    feedback.push('Close. The gap now is confidence rather than technique — the same again tomorrow will do it.');
  } else if (changes > 0) {
    feedback.push('Try moving both fingers as one shape rather than placing them one at a time. That is usually what is costing the time.');
  }
  if (wrong > changes * 0.3 && wrong > 2) {
    feedback.push(`${wrong} of them landed on something else on the way. Slow down until that stops happening.`);
  }
  return { quality, passed: fluent, feedback, changesPerMinute };
}

/**
 * Grade a progression on whether the right chord arrived in the right bar.
 *
 * Bars are matched by position in time rather than by counting chords, so
 * missing one does not shift everything after it and turn a single slip into
 * a failed attempt.
 */
export function gradeProgression(exercise: Exercise, heard: HeardChord[], startedAt: number): Grade {
  const sequence = exercise.chords ?? [];
  if (sequence.length === 0) return { quality: 0, passed: false, feedback: ['That exercise has no chords set.'] };
  if (heard.length === 0) {
    return { quality: 0, passed: false, feedback: ['I did not hear anything that time.'] };
  }

  const barMs = 4 * (60_000 / exercise.bpm);
  const bars = Math.max(1, Math.round((heard[heard.length - 1]!.at - startedAt) / barMs));
  let correct = 0;
  const missed = new Map<string, number>();

  for (let bar = 0; bar < bars; bar++) {
    const expected = sequence[bar % sequence.length]!;
    const windowStart = startedAt + bar * barMs;
    // A generous window: a beginner's chord lands late more often than not.
    const inBar = heard.filter((c) => c.at >= windowStart - barMs * 0.35 && c.at < windowStart + barMs * 1.1);
    if (inBar.some((c) => c.label === expected)) correct++;
    else missed.set(expected, (missed.get(expected) ?? 0) + 1);
  }

  const quality = correct / bars;
  const feedback: string[] = [];
  feedback.push(`${correct} of ${bars} bars landed on the right chord.`);

  const worst = [...missed.entries()].sort((a, b) => b[1] - a[1])[0];
  if (quality >= 0.9) {
    feedback.push('You kept your place the whole way. That is the hard part of a progression, not the chords.');
  } else if (worst) {
    feedback.push(`${worst[0]} is where it keeps coming apart. Practise just the change into it and the rest will follow.`);
  }
  if (bars < sequence.length) {
    feedback.push('That did not get all the way round. Try it slower — the tempo is yours to set.');
  }

  return { quality, passed: quality >= 0.85 && bars >= sequence.length, feedback };
}

/**
 * Grade holding a single chord: did it sound, and did it keep sounding?
 *
 * Consistency is the thing here. A beginner can usually get one clean strum;
 * what they cannot yet do is get four in a row without the shape collapsing,
 * and that is the difference between knowing a chord and having it.
 */
export function gradeHoldChord(exercise: Exercise, heard: HeardChord[], elapsedMs: number): Grade {
  const wanted = exercise.chords?.[0];
  if (!wanted) return { quality: 0, passed: false, feedback: ['That exercise has no chord set.'] };
  if (heard.length === 0) {
    return {
      quality: 0, passed: false,
      feedback: [`I did not hear ${wanted}. Strum a bit harder, or check the shape and try again.`],
    };
  }

  const right = heard.filter((c) => c.label === wanted).length;
  const share = right / heard.length;
  // Four clean readings is the target; more than that is just more of the same.
  const quality = Math.max(0, Math.min(1, share * Math.min(1, right / 4)));

  const feedback: string[] = [];
  if (right === 0) {
    const other = heard[heard.length - 1]!.label;
    feedback.push(`That came out as ${other} rather than ${wanted}. Worth checking which strings you are meant to be hitting.`);
  } else if (share >= 0.8 && right >= 4) {
    feedback.push(`${right} clean ones. That chord is yours — it rang every time.`);
  } else if (right >= 4) {
    feedback.push(`${right} clean, but it dropped out in between. The shape is right; holding it while you strum is the bit to work on.`);
  } else {
    feedback.push(`${right} clean so far. Keep the shape down and strum again without resetting your fingers.`);
  }
  if (elapsedMs < exercise.durationMs * 0.5) feedback.push('That was a short go — give it the full time and it settles.');

  return { quality, passed: share >= 0.8 && right >= 4, feedback };
}

/** Turn a graded attempt into something the mastery model can learn from. */
export function observationFrom(exercise: Exercise, grade: Grade, at = Date.now()): Observation {
  return {
    skillId: exercise.skillId,
    quality: grade.quality,
    at,
    source: 'drill',
    ...(grade.changesPerMinute !== undefined ? { changesPerMinute: grade.changesPerMinute } : {}),
  };
}
