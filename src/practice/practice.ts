/**
 * Riff Practice Mode.
 *
 * Instead of teaching you a famous song, this teaches you your own riff. The
 * feedback is written the way another player in the room would say it: lead
 * with what went right, name the exact note that went wrong and where, and
 * keep it to something you can act on before the next attempt.
 */

import type { NoteEvent, Riff, RiffVersion } from '../types.ts';
import { cleanestIndex } from '../phrase/quality.ts';
import { diffTakes } from '../phrase/diff.ts';
import type { NoteChange, TakeDiff } from '../phrase/diff.ts';
import { timeScale } from '../phrase/edit.ts';
import { timingSteadiness } from '../music/rhythm.ts';

export interface PracticeResult {
  /**
   * How much of the attempt and the riff line up, 0..1. Measured against
   * whichever is longer, so playing the right notes buried in a pile of wrong
   * ones does not read as a perfect run.
   */
  accuracy: number;
  /** >1 means the attempt was faster than the reference. */
  tempoRatio: number;
  diff: TakeDiff;
  /** How many notes were right before the first mistake. */
  openingRun: number;
  /** Index into the reference of the first note that went wrong. */
  firstMistakeIndex: number | null;
  /** True when it was note-for-note right and roughly in time. */
  nailed: boolean;
  /** Coaching, in the order it should be said. */
  feedback: string[];
}

export interface PracticeOptions {
  /** Accuracy needed to count as nailed. Default 1 — every note. */
  requiredAccuracy?: number;
  /** Tempo drift tolerated before it gets mentioned. Default 12%. */
  tempoTolerance?: number;
}

/** Where in the riff something happened, in words a player would use. */
function whereInRiff(index: number, total: number): string {
  if (total <= 1) return 'right at the start';
  const position = index / total;
  if (index === 0) return 'right at the start';
  if (position < 0.34) return 'in the opening';
  if (position < 0.67) return 'in the middle';
  if (index === total - 1) return 'on the very last note';
  return 'near the end';
}

function countOpeningRun(changes: NoteChange[]): number {
  let run = 0;
  for (const change of changes) {
    if (change.kind !== 'kept') break;
    run++;
  }
  return run;
}

export function practiceAttempt(
  reference: NoteEvent[],
  attempt: NoteEvent[],
  options: PracticeOptions = {},
): PracticeResult {
  const requiredAccuracy = options.requiredAccuracy ?? 1;
  const tolerance = options.tempoTolerance ?? 0.12;
  const diff = diffTakes(reference, attempt);
  const compared = Math.max(reference.length, attempt.length);
  const accuracy = compared === 0 ? 0 : diff.keptCount / compared;
  const openingRun = countOpeningRun(diff.changes);

  const firstMistake = diff.changes.find((c) => c.kind !== 'kept');
  const firstMistakeIndex = firstMistake?.fromIndex ?? null;

  const feedback: string[] = [];
  const inTime = Math.abs(diff.tempoRatio - 1) <= tolerance;
  const nailed = accuracy >= requiredAccuracy && diff.identical && inTime;

  if (attempt.length === 0) {
    return {
      accuracy: 0, tempoRatio: 1, diff, openingRun: 0, firstMistakeIndex: null, nailed: false,
      feedback: ["I didn't hear anything that time — give it another go."],
    };
  }

  if (nailed && inTime) {
    feedback.push("That's it — note for note.");
  } else {
    if (openingRun >= 3 || (openingRun > 0 && openingRun / reference.length >= 0.4)) {
      feedback.push('You nailed the opening.');
    }

    const mistakes = diff.changes.filter((c) => c.kind !== 'kept');
    for (const mistake of mistakes.slice(0, 2)) {
      const at = whereInRiff(mistake.fromIndex ?? mistake.toIndex ?? 0, reference.length);
      if (mistake.kind === 'changed') {
        feedback.push(`${capitalise(at)} you played ${mistake.toNote} instead of ${mistake.fromNote}.`);
      } else if (mistake.kind === 'added') {
        feedback.push(`${capitalise(at)} you slipped in an extra ${mistake.toNote}.`);
      } else {
        feedback.push(`${capitalise(at)} you skipped the ${mistake.fromNote}.`);
      }
    }
    if (mistakes.length > 2) {
      feedback.push(`There were ${mistakes.length - 2} other differences after that.`);
    }
  }

  if (!inTime) {
    const pct = Math.round(Math.abs(diff.tempoRatio - 1) * 100);
    const word = diff.tempoRatio > 1 ? 'faster' : 'slower';
    feedback.push(`Your rhythm was about ${pct}% ${word} than the original take.`);
  } else if (nailed) {
    const steadyRef = timingSteadiness(reference);
    const steadyAttempt = timingSteadiness(attempt);
    if (steadyAttempt < steadyRef - 0.12) {
      feedback.push('The notes were all right, but the timing wandered a little more than last time.');
    }
  }

  if (!nailed) feedback.push('Try it again.');

  return { accuracy, tempoRatio: diff.tempoRatio, diff, openingRun, firstMistakeIndex, nailed, feedback };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type PracticeTarget = 'original' | 'latest' | 'best';

/** Versions are appended in creation order, including branches from older takes. */
export function practiceVersion(riff: Riff, target: PracticeTarget): RiffVersion {
  if (!riff.versions.length) throw new Error('This riff has no takes to practise.');
  if (target === 'original') return riff.versions[0]!;
  if (target === 'latest') return riff.versions[riff.versions.length - 1]!;
  return riff.versions[cleanestIndex(riff.versions.map((v) => v.notes))]!;
}

export interface PracticePlan {
  target: PracticeTarget;
  version: RiffVersion;
  /** The notes to play along with, already slowed if asked for. */
  notes: NoteEvent[];
  /** 1 = original speed, 0.75 = three-quarter speed, and so on. */
  speed: number;
  label: string;
}

/**
 * Build what to practise against. Slowing down re-times the notes only —
 * pitch is untouched, which is the whole point of practising slowly.
 */
export function buildPracticePlan(version: RiffVersion, target: PracticeTarget, speed = 1): PracticePlan {
  if (speed <= 0 || speed > 2) throw new Error('speed must be between 0 and 2');
  const notes = speed === 1 ? [...version.notes] : timeScale(version.notes, 1 / speed);
  const speedLabel = speed === 1 ? '' : ` at ${Math.round(speed * 100)}% speed`;
  return {
    target,
    version,
    notes,
    speed,
    label: `${version.label} (${target})${speedLabel}`,
  };
}
