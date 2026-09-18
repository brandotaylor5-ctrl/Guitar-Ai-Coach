/**
 * Choosing the song, and choosing how much of it you play today.
 *
 * This is the part that is supposed to feel like a teacher rather than a
 * catalogue. A catalogue shows you eighty songs and lets you fail at them. A
 * teacher knows which two chords you have, picks the song that needs exactly
 * those, sets every section to a version your hands can actually do, and tells
 * you which single chord would open up three more songs.
 */

import { levelOf, WORKABLE } from '../curriculum/mastery.ts';
import type { SkillMastery } from '../curriculum/mastery.ts';
import { SKILLS } from '../curriculum/skills.ts';
import { SONGS, chordsIn } from './library.ts';
import type { Level, Song, SongSection } from './library.ts';

/** The skill id that teaches a given chord, if the curriculum has one. */
function skillForChord(chord: string): string | null {
  return SKILLS.find((skill) => skill.kind === 'chord' && skill.chord === chord)?.id ?? null;
}

export function canPlayChord(chord: string, mastery: Map<string, SkillMastery>): boolean {
  const skill = skillForChord(chord);
  return skill ? levelOf(mastery, skill) >= WORKABLE : false;
}

export interface Readiness {
  song: Song;
  /** Chords the song needs that the player already has. */
  have: string[];
  /** Chords they do not have yet. */
  missing: string[];
  /** True when every chord is there. */
  ready: boolean;
  /** 0..1, for ordering rather than for showing anyone. */
  fraction: number;
}

export function readinessFor(song: Song, mastery: Map<string, SkillMastery>): Readiness {
  const needed = chordsIn(song);
  const have = needed.filter((chord) => canPlayChord(chord, mastery));
  const missing = needed.filter((chord) => !have.includes(chord));
  return {
    song, have, missing,
    ready: missing.length === 0,
    fraction: needed.length ? have.length / needed.length : 0,
  };
}

/**
 * Songs you can play right now, easiest first.
 *
 * Deliberately not "songs sorted by difficulty". A song you cannot play is not
 * easier than one you can, whatever its rating says.
 */
export function playableNow(mastery: Map<string, SkillMastery>): Readiness[] {
  return SONGS.map((song) => readinessFor(song, mastery))
    .filter((r) => r.ready)
    .sort((a, b) => a.song.difficulty - b.song.difficulty);
}

/**
 * The one chord that would open the most songs.
 *
 * This is the answer to "why am I learning this?", and it is a much better
 * answer than "it comes next in the list". Learning D because it finishes
 * three songs you already half-know is a reason a person can feel.
 */
export function chordThatUnlocksMost(mastery: Map<string, SkillMastery>): {
  chord: string;
  unlocks: Song[];
} | null {
  const counts = new Map<string, Song[]>();
  for (const song of SONGS) {
    const { missing } = readinessFor(song, mastery);
    // Only one chord away — two is not a promise you can keep today.
    if (missing.length !== 1) continue;
    const chord = missing[0]!;
    if (!skillForChord(chord)) continue;
    counts.set(chord, [...(counts.get(chord) ?? []), song]);
  }
  let best: { chord: string; unlocks: Song[] } | null = null;
  for (const [chord, unlocks] of counts) {
    if (!best || unlocks.length > best.unlocks.length) best = { chord, unlocks };
  }
  return best;
}

/** Songs one chord short, so progress is visible before it is complete. */
export function almostThere(mastery: Map<string, SkillMastery>): Readiness[] {
  return SONGS.map((song) => readinessFor(song, mastery))
    .filter((r) => r.missing.length === 1)
    .sort((a, b) => a.song.difficulty - b.song.difficulty);
}

const ORDER: Level[] = ['strum', 'boom-chuck', 'melody'];

/**
 * Which version of a section to put in front of them.
 *
 * Starts everyone on the simplest version that is still the actual song, and
 * moves up once the underlying skills are genuinely there. Nobody is ever
 * shown a part they cannot attempt — the whole point of levelled parts is that
 * the song is never locked, only the hardest way of playing it is.
 */
export function suggestedLevel(section: SongSection, mastery: Map<string, SkillMastery>): Level {
  const available = section.parts.map((part) => part.level);
  const steady = levelOf(mastery, 'technique.steady-strum') >= WORKABLE;
  const picking = levelOf(mastery, 'technique.alternate-picking') >= WORKABLE;
  const cleanNotes = levelOf(mastery, 'technique.clean-notes') >= WORKABLE;

  const wanted: Level = picking && cleanNotes ? 'melody' : steady ? 'boom-chuck' : 'strum';
  // Never suggest a level this section does not have a version for.
  for (let i = ORDER.indexOf(wanted); i >= 0; i--) {
    const level = ORDER[i]!;
    if (available.includes(level)) return level;
  }
  return available[0] ?? 'strum';
}

export function partAt(section: SongSection, level: Level): SongSection['parts'][number] {
  return section.parts.find((part) => part.level === level) ?? section.parts[0]!;
}

export const LEVEL_NAMES: Record<Level, string> = {
  strum: 'Just the chords',
  'boom-chuck': 'Bass and strum',
  melody: 'The melody',
};

export const LEVEL_BLURBS: Record<Level, string> = {
  strum: 'One strum a bar. You are playing the song from today.',
  'boom-chuck': 'Bass note, strum, bass note, strum. This is what makes it sound like a record.',
  melody: 'The actual tune, note for note.',
};
