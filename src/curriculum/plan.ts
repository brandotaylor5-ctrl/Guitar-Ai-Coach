/**
 * Deciding what to work on next — the part that behaves like a teacher.
 *
 * A teacher does three things a lesson list cannot. They notice what you can
 * already do and skip it. They pick one thing to work on rather than twelve.
 * And they come back to something you had last week before it slips away.
 *
 * All three are decisions about *this* player, so all three are made here,
 * from the mastery built out of what they actually played.
 */

import type { Skill } from './skills.ts';
import { SKILLS, getSkill } from './skills.ts';
import { MASTERED, WORKABLE, levelOf } from './mastery.ts';
import type { SkillMastery } from './mastery.ts';

export type LessonReason = 'next-step' | 'needs-work' | 'review' | 'foundation';

export interface Lesson {
  skill: Skill;
  reason: LessonReason;
  /** What the coach would say when putting this in front of them. */
  because: string;
  /** 0..1 — how urgent this is relative to everything else available. */
  priority: number;
}

export interface PlanOptions {
  /** How many things to offer. A teacher picks one; the rest are context. */
  count?: number;
  now?: number;
}

/** Ready to try when everything it depends on is at least workable. */
function isUnlocked(skill: Skill, mastery: Map<string, SkillMastery>): boolean {
  return skill.requires.every((id) => levelOf(mastery, id) >= WORKABLE);
}

/** Something known but going stale — worth a minute before it is lost. */
function isFading(skillId: string, mastery: Map<string, SkillMastery>, now: number): boolean {
  const record = mastery.get(skillId);
  if (!record) return false;
  const days = (now - record.lastSeenAt) / 86_400_000;
  return record.level >= WORKABLE && record.level < 0.9 && days >= 5;
}

/**
 * What to work on, best first.
 *
 * The ordering rule is a teacher's: finish what you started, then keep what
 * you have, then start something new. Nobody makes progress by opening five
 * things at once.
 */
export function planLessons(mastery: Map<string, SkillMastery>, options: PlanOptions = {}): Lesson[] {
  const now = options.now ?? Date.now();
  const count = options.count ?? 3;
  const lessons: Lesson[] = [];

  for (const skill of SKILLS) {
    const level = levelOf(mastery, skill.id);
    if (level >= MASTERED && !isFading(skill.id, mastery, now)) continue;
    if (!isUnlocked(skill, mastery)) continue;

    if (level >= WORKABLE) {
      if (isFading(skill.id, mastery, now)) {
        const days = Math.round((now - (mastery.get(skill.id)?.lastSeenAt ?? now)) / 86_400_000);
        lessons.push({
          skill, reason: 'review', priority: 0.7,
          because: `You had this ${days} days ago. A couple of minutes now and it stays yours.`,
        });
      }
      // Workable is intentionally not the same as mastered. Once a learner
      // can use a skill, move forward now and let ordinary playing plus later
      // review turn it into mastery. Repeating the same chord immediately is
      // how a curriculum feels stuck even when the learner succeeded.
      continue;
    } else if (level > 0) {
      lessons.push({
        skill, reason: 'needs-work', priority: 0.9,
        because: 'You started this one but it is not usable yet. One focused pass here should open the next door.',
      });
    } else if (skill.requires.length === 0) {
      lessons.push({
        skill, reason: 'foundation', priority: 0.85,
        because: 'This is where it starts. Everything else leans on it.',
      });
    } else {
      lessons.push({
        skill, reason: 'next-step', priority: 0.6,
        because: `You can already do what this needs — ${skill.requires
          .map((id) => getSkill(id)?.name ?? id).join(' and ')}. This is the next step.`,
      });
    }
  }

  // Ties broken by position in the graph, so the natural order survives when
  // nothing else distinguishes two lessons.
  return lessons
    .map((lesson, index) => ({ lesson, index }))
    .sort((a, b) => b.lesson.priority - a.lesson.priority || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.lesson);
}

export interface Progress {
  mastered: number;
  inProgress: number;
  total: number;
  /** 0..1 across the whole curriculum. */
  fraction: number;
  /** The most advanced thing they can currently do, for a sense of where they are. */
  furthest: Skill | null;
}

export function progressOf(mastery: Map<string, SkillMastery>): Progress {
  let mastered = 0;
  let inProgress = 0;
  let furthest: Skill | null = null;

  for (const skill of SKILLS) {
    const level = levelOf(mastery, skill.id);
    if (level >= MASTERED) {
      mastered++;
      furthest = skill;
    } else if (level > 0) inProgress++;
  }

  return {
    mastered,
    inProgress,
    total: SKILLS.length,
    fraction: mastered / SKILLS.length,
    furthest,
  };
}

/**
 * A short read on where the player is, in a teacher's voice.
 *
 * Never a score and never a percentage — those tell a beginner nothing except
 * how far they are from someone else.
 */
export function describeProgress(mastery: Map<string, SkillMastery>): string {
  const progress = progressOf(mastery);
  if (progress.mastered === 0 && progress.inProgress === 0) {
    return 'We have not heard you play yet. Play anything at all and I will work out where to start.';
  }
  if (progress.mastered === 0) {
    return 'You are getting the first shapes under your fingers. That is the hardest part and it does not last long.';
  }
  const name = progress.furthest?.name ?? 'what you have';
  if (progress.mastered < 4) {
    return `${progress.mastered} shapes are solid, ${name} most recently. Changes between them are what to chase next.`;
  }
  if (progress.mastered < 9) {
    return `You have ${progress.mastered} skills holding steady up to ${name}. You are past the beginning — this is where songs start to be playable.`;
  }
  return `${progress.mastered} skills solid, through ${name}. You can play a lot of music with what is already in your hands.`;
}
