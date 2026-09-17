/**
 * Learning what the player can do without ever testing them.
 *
 * Most of what a teacher knows about you, they picked up while you were
 * warming up or messing about — not from an exam. This watches ordinary
 * playing and records the same kind of evidence a drill would, just trusted
 * a little less.
 *
 * It means someone who already plays never has to sit through the beginning,
 * and someone who quietly got better at a change gets credit for it the next
 * time they open the app.
 */

import type { Observation } from './mastery.ts';
import { SKILLS } from './skills.ts';
import { FLUENT_CHANGES_PER_MINUTE } from './skills.ts';

export interface HeardChordEvent {
  label: string;
  confidence: number;
  at: number;
}

const CHORD_SKILL = new Map(
  SKILLS.filter((s) => s.kind === 'chord' && s.chord).map((s) => [s.chord!, s.id]),
);

/** Both orderings, so a change is found whichever way round it was played. */
const CHANGE_SKILL = new Map<string, string>();
for (const skill of SKILLS) {
  if (skill.kind === 'change' && skill.between) {
    const [a, b] = skill.between;
    CHANGE_SKILL.set(`${a}>${b}`, skill.id);
    CHANGE_SKILL.set(`${b}>${a}`, skill.id);
  }
}

/** Below this the detector is guessing, and a guess is not evidence. */
const TRUSTED_CONFIDENCE = 0.72;
/** A change taking longer than this was not really a change, it was a restart. */
const MAX_CHANGE_GAP_MS = 6_000;

/**
 * Read a stretch of free playing for evidence.
 *
 * Quality is capped below what a drill can earn: playing a chord in passing
 * shows you can find it, not that it is solid. Passing needs the drill.
 */
export function observeFreePlay(heard: HeardChordEvent[], now = Date.now()): Observation[] {
  const trusted = heard.filter((c) => c.confidence >= TRUSTED_CONFIDENCE).sort((a, b) => a.at - b.at);
  if (trusted.length === 0) return [];

  const observations: Observation[] = [];
  const seenChords = new Set<string>();

  for (const chord of trusted) {
    const skillId = CHORD_SKILL.get(chord.label);
    if (!skillId || seenChords.has(skillId)) continue;
    seenChords.add(skillId);
    observations.push({
      skillId,
      // Heard cleanly enough to name, which is real but partial evidence.
      quality: Math.min(0.7, chord.confidence),
      at: chord.at,
      source: 'freeplay',
    });
  }

  // Changes actually made while playing, and how fast they were taken.
  const changeTimes = new Map<string, number[]>();
  for (let i = 1; i < trusted.length; i++) {
    const previous = trusted[i - 1]!;
    const current = trusted[i]!;
    if (previous.label === current.label) continue;
    const gap = current.at - previous.at;
    if (gap <= 0 || gap > MAX_CHANGE_GAP_MS) continue;
    const skillId = CHANGE_SKILL.get(`${previous.label}>${current.label}`);
    if (!skillId) continue;
    const list = changeTimes.get(skillId) ?? [];
    list.push(gap);
    changeTimes.set(skillId, list);
  }

  for (const [skillId, gaps] of changeTimes) {
    // Two changes is a coincidence; three is a player who can do it.
    if (gaps.length < 3) continue;
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
    const changesPerMinute = Math.round(60_000 / median);
    observations.push({
      skillId,
      quality: Math.min(0.7, changesPerMinute / FLUENT_CHANGES_PER_MINUTE),
      at: now,
      source: 'freeplay',
      changesPerMinute,
    });
  }

  return observations;
}

/**
 * Take the player at their word about what they can already play.
 *
 * Waiting to overhear every chord is the right default but a poor start: a
 * player who already knows four chords should not have to demonstrate each
 * one before the app has anything useful to say. Declaring them is treated
 * as real but unconfirmed — enough to plan around, not enough to call
 * mastered, and the first time they actually play one it settles.
 */
export function declareKnownChords(chords: string[], now = Date.now()): Observation[] {
  const out: Observation[] = [];
  for (const chord of chords) {
    const skillId = CHORD_SKILL.get(chord);
    if (!skillId) continue;
    // Take them at their word: being told to go and practise a chord you just
    // said you can play is the fastest way to lose someone's trust. If a drill
    // later says otherwise, that is stronger evidence and this gives way to it.
    // Spread over past days so it reads as a standing ability rather than a
    // burst of practice.
    for (let i = 0; i < 12; i++) {
      out.push({ skillId, quality: 0.86, at: now - i * 43_200_000, source: 'freeplay' });
    }
  }
  return out;
}

// --- keeping what was learned ----------------------------------------------

export interface ObservationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CURRICULUM_KEY = 'guitar-ai-coach.curriculum.v1';

/** How many observations to keep. Older ones have decayed to nothing anyway. */
const MAX_KEPT = 800;

export class CurriculumStore {
  private readonly storage: ObservationStorage;
  private readonly key: string;

  constructor(storage: ObservationStorage, key: string = CURRICULUM_KEY) {
    this.storage = storage;
    this.key = key;
  }

  load(): Observation[] {
    const raw = this.storage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { observations?: Observation[] };
      return Array.isArray(parsed.observations) ? parsed.observations : [];
    } catch {
      // A corrupt record should cost the player their history, not the app.
      return [];
    }
  }

  record(newOnes: Observation[]): Observation[] {
    if (newOnes.length === 0) return this.load();
    const all = [...this.load(), ...newOnes].slice(-MAX_KEPT);
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, observations: all }));
    } catch {
      // Out of storage. The session still works; the history just stops growing.
    }
    return all;
  }
}
