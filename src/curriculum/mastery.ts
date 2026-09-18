/**
 * What the player can actually do, learned from what they actually played.
 *
 * Mastery is never entered by hand and never comes from a quiz. It is built
 * from observations — a chord that rang cleanly, a change made in time, a
 * scale run that stayed accurate — and those observations can come from a
 * drill or from the player simply noodling. Most of what a teacher knows
 * about you they learned while you were not being tested.
 *
 * Recent evidence counts for more than old evidence, so a skill decays if it
 * is left alone. That is honest: a chord you last played in March is not a
 * chord you have.
 */

export interface Observation {
  skillId: string;
  /** 0..1 — how well it went. */
  quality: number;
  /** When it happened. */
  at: number;
  /** Where it came from. Drills are trusted more than passive listening. */
  source: 'drill' | 'freeplay' | 'lesson';
  /** For a change: clean changes per minute achieved. */
  changesPerMinute?: number;
}

export interface SkillMastery {
  skillId: string;
  /** 0..1. Above 0.75 a teacher would stop watching it closely. */
  level: number;
  /** How many separate sessions it has been seen in. */
  sessions: number;
  lastSeenAt: number;
  /** Best changes-per-minute observed, for change skills. */
  bestChangesPerMinute?: number;
}

/** A skill decays to about half its level after this long untouched. */
export const HALF_LIFE_DAYS = 21;

/** Below this, a teacher would still be watching. Above it, it is yours. */
export const MASTERED = 0.75;
/**
 * Enough to build on without pretending it is mastered.
 *
 * One clean, deliberate drill lands at about .34 in the mastery model. The old
 * .45 threshold therefore forced a beginner to repeat a chord they had just
 * successfully learned before anything new could unlock. A real teacher does
 * not do that: one successful first lesson is enough to start the next idea,
 * while later repetition is what turns the skill into mastery.
 */
export const WORKABLE = 0.30;

/** Passive listening is weaker evidence than a drill someone tried to pass. */
const SOURCE_WEIGHT = { drill: 1, freeplay: 0.55, lesson: 1 } as const;

function decayFactor(elapsedMs: number): number {
  const days = elapsedMs / 86_400_000;
  return Math.pow(0.5, Math.max(0, days) / HALF_LIFE_DAYS);
}

/**
 * Fold observations into a mastery level.
 *
 * Deliberately slow to rise and slow to fall: one good attempt is luck, and
 * one bad one is a bad take, so neither should move the number much.
 */
export function masteryFrom(observations: Observation[], now = Date.now()): SkillMastery | null {
  if (observations.length === 0) return null;
  const skillId = observations[0]!.skillId;
  const ordered = [...observations].sort((a, b) => a.at - b.at);

  let level = 0;
  for (const observation of ordered) {
    const weight = SOURCE_WEIGHT[observation.source] * 0.34;
    // Move towards this observation rather than averaging, so a run of good
    // attempts accumulates and a single fluke does not.
    level += (observation.quality - level) * weight;
  }

  const lastSeenAt = ordered[ordered.length - 1]!.at;
  level *= decayFactor(now - lastSeenAt);

  const days = new Set(ordered.map((o) => Math.floor(o.at / 86_400_000)));
  const cpm = ordered
    .map((o) => o.changesPerMinute ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    skillId,
    level: Math.max(0, Math.min(1, level)),
    sessions: days.size,
    lastSeenAt,
    ...(cpm > 0 ? { bestChangesPerMinute: cpm } : {}),
  };
}

/** Mastery for every skill an observation has been recorded against. */
export function masteryMap(observations: Observation[], now = Date.now()): Map<string, SkillMastery> {
  const bySkill = new Map<string, Observation[]>();
  for (const observation of observations) {
    const list = bySkill.get(observation.skillId) ?? [];
    list.push(observation);
    bySkill.set(observation.skillId, list);
  }
  const out = new Map<string, SkillMastery>();
  for (const [skillId, list] of bySkill) {
    const mastery = masteryFrom(list, now);
    if (mastery) out.set(skillId, mastery);
  }
  return out;
}

export function levelOf(mastery: Map<string, SkillMastery>, skillId: string): number {
  return mastery.get(skillId)?.level ?? 0;
}

export function isMastered(mastery: Map<string, SkillMastery>, skillId: string): boolean {
  return levelOf(mastery, skillId) >= MASTERED;
}
