/**
 * Today's practice, as a session rather than a menu.
 *
 * Sixteen steps you can browse is a book. What actually moves somebody along
 * is a short, ordered, timed session they do today and again tomorrow, and the
 * single largest difference between people who get good at guitar and people
 * who quit is not talent or hours — it is whether the hours were structured.
 *
 * The shape is the one every good teacher uses, and none of it is arbitrary:
 *
 *   Warm up on something you can already do, so the first two minutes are not
 *   spent failing. Then the new thing, while you are fresh, because that is
 *   the only part that needs a clear head. Then bring back something going
 *   stale, because forgetting is the actual enemy and it is invisible. Then
 *   play a song, all the way through, because that is the reason for the rest
 *   of it and because ending on music is what makes you come back tomorrow.
 *
 * Sessions are built to a time budget you choose, not to a fixed list. Ten
 * honest minutes every day beats an hour on Sunday, and a plan that does not
 * fit the time available is a plan that gets skipped.
 */

import { MASTERED, WORKABLE, levelOf } from './mastery.ts';
import type { SkillMastery } from './mastery.ts';
import { PATH } from './path.ts';
import type { PathStep } from './path.ts';
import { SKILLS } from './skills.ts';
import { SONGS, chordsIn } from '../songs/library.ts';
import type { Song } from '../songs/library.ts';

export type ItemKind = 'warm-up' | 'new' | 'review' | 'song' | 'play';

export interface SessionItem {
  kind: ItemKind;
  title: string;
  /** What to actually do for these minutes. */
  what: string;
  /**
   * The actual instructions, so the session can be done on this screen.
   *
   * Without these the card showed a one-line summary and a button to go and
   * read the real thing somewhere else, which makes a session a table of
   * contents rather than something you can do.
   */
  do?: string[];
  /**
   * Heading for this slot, when the kind's usual one would be a lie.
   *
   * A slot headed "Play something whole" that then says you cannot play
   * anything yet is exactly the kind of thing that makes an app feel broken.
   */
  label?: string;
  /** Why this is in today's session, in the coach's voice. */
  because: string;
  minutes: number;
  /** Where in the app to do it. */
  goTo?: { view: 'path' | 'session' | 'songs' | 'song' | 'lessons'; params?: Record<string, string> };
}

export interface PracticeSession {
  items: SessionItem[];
  minutes: number;
}

const KIND_ORDER: ItemKind[] = ['warm-up', 'new', 'review', 'song', 'play'];

/** Chords the player can hold, for picking warm-ups and songs. */
function knownChords(mastery: Map<string, SkillMastery>): string[] {
  return SKILLS
    .filter((skill) => skill.kind === 'chord' && skill.chord && levelOf(mastery, skill.id) >= WORKABLE)
    .map((skill) => skill.chord!);
}

/** Something known but slipping. Forgetting is invisible, so it gets a slot. */
function fadingSkill(mastery: Map<string, SkillMastery>, now: number) {
  let worst: { id: string; name: string; days: number } | null = null;
  for (const skill of SKILLS) {
    const record = mastery.get(skill.id);
    if (!record) continue;
    const level = levelOf(mastery, skill.id);
    if (level < WORKABLE || level >= MASTERED) continue;
    const days = (now - record.lastSeenAt) / 86_400_000;
    if (days < 3) continue;
    if (!worst || days > worst.days) worst = { id: skill.id, name: skill.name, days: Math.round(days) };
  }
  return worst;
}

function playableSongs(mastery: Map<string, SkillMastery>): Song[] {
  const known = new Set(knownChords(mastery));
  return SONGS
    .filter((song) => chordsIn(song).every((chord) => known.has(chord)))
    .sort((a, b) => a.difficulty - b.difficulty);
}

/**
 * Build today's session inside the minutes available.
 *
 * Items are added in teaching order and then trimmed from the back, so a short
 * session loses the extras rather than the new material. The new thing and a
 * warm-up survive even a five-minute session, because those two are what make
 * it practice rather than noodling.
 */
export function buildSession(
  current: PathStep,
  mastery: Map<string, SkillMastery>,
  minutes = 15,
  now = Date.now(),
): PracticeSession {
  const items: SessionItem[] = [];
  const chords = knownChords(mastery);
  const songs = playableSongs(mastery);
  const fading = fadingSkill(mastery, now);

  // 1. Warm up on something already working.
  if (chords.length >= 2) {
    const [a, b] = chords;
    items.push({
      kind: 'warm-up',
      title: `Loosen up: ${a} to ${b}`,
      what: `Change between ${a} and ${b}, four strums each, slowly. No counting how many — just until your hand stops feeling cold.`,
      because: 'Starting on something you can already do means the first minutes are not spent failing, which is most of why people stop enjoying practice.',
      minutes: 2,
      goTo: { view: 'session' },
    });
  } else {
    items.push({
      kind: 'warm-up',
      title: 'Loosen up',
      what: 'Play any single string, one note at a time, up and down the first four frets. Slowly, evenly.',
      because: 'Your hands need a minute before they can do anything careful. This is that minute.',
      minutes: 2,
      goTo: { view: 'session' },
    });
  }

  // 2. The new thing, while there is a clear head for it.
  items.push({
    kind: 'new',
    title: current.title,
    what: current.outcome,
    do: current.steps,
    because: 'New material goes here because it is the only part that needs you fresh. Everything else survives being tired.',
    minutes: Math.max(4, Math.round(minutes * 0.35)),
    goTo: { view: 'path' },
  });

  // 3. Something going stale.
  if (fading) {
    items.push({
      kind: 'review',
      title: `Bring back ${fading.name}`,
      what: `You had this ${fading.days} days ago. A couple of minutes is enough to keep it.`,
      because: 'Forgetting is the real enemy and it is invisible — nothing tells you a chord is slipping until you reach for it and it is gone.',
      minutes: 3,
      goTo: { view: 'lessons' },
    });
  }

  // 4. A whole song, because that is the point of the other things.
  if (songs.length) {
    const song = songs[Math.floor(now / 86_400_000) % songs.length]!;
    items.push({
      kind: 'song',
      title: `Play ${song.title} all the way through`,
      what: 'Start to finish without stopping, even if a change is late. Stopping to fix things is a different exercise.',
      because: 'Playing something whole is the reason for all of the above, and ending a session on music is most of why you come back tomorrow.',
      minutes: 4,
      goTo: { view: 'song', params: { song: song.id } },
    });
  } else {
    // Never a slot headed "play something whole" that names no song. The
    // easiest one in the repertoire is the target, and it is named, linked
    // and playable to listen to even before it can be played.
    const target = [...SONGS].sort((a, b) => a.difficulty - b.difficulty)[0]!;
    const needs = chordsIn(target);
    items.push({
      kind: 'song',
      label: 'The song you are working towards',
      title: `Listen to ${target.title}`,
      what: `You cannot play it yet — it needs ${needs.join(' and ')}. Open it, press "Hear the whole song", and look at the chord shapes while it plays. This is the one you are working towards.`,
      because: `${target.title} is the shortest distance between where you are and playing a whole song. Knowing which song the work is for is most of what keeps the work happening.`,
      minutes: 3,
      goTo: { view: 'song', params: { song: target.id } },
    });
  }

  // 5. Free play — but only once there is something to play with. Telling
  // somebody who cannot yet fret a note to "mess about" is not an invitation,
  // it is a blank page.
  if (chords.length >= 1) {
    items.push({
      kind: 'play',
      title: 'Play whatever you want',
      what: 'No goal. Mess about. If something sounds good, play it twice so you remember it.',
      because: 'Practice with no play in it stops being something you do. This is also where your own ideas come from — the app is listening if you want it caught.',
      minutes: 2,
      goTo: { view: 'session' },
    });
  } else {
    items.push({
      kind: 'play',
      label: 'Finish with your ears',
      title: 'Get used to the sound',
      what: 'Play each string on its own, slowly, from thickest to thinnest and back. Listen to how long each one rings before it fades.',
      because: 'Before anything else, your ear needs to know what this instrument sounds like when it is working. It also tells you whether it is in tune.',
      minutes: 2,
      goTo: { view: 'session' },
    });
  }

  return trimTo(items, minutes);
}

/**
 * Fit the session into the time available.
 *
 * Extras go first. A warm-up and the new thing are what make a session
 * practice rather than noodling, so they are the last things to be cut, and
 * the new thing keeps at least a few real minutes.
 */
function trimTo(items: SessionItem[], minutes: number): PracticeSession {
  const kept = [...items].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
  const priority: ItemKind[] = ['play', 'review', 'song', 'warm-up', 'new'];

  let total = kept.reduce((sum, item) => sum + item.minutes, 0);
  for (const kind of priority) {
    if (total <= minutes) break;
    const index = kept.findIndex((item) => item.kind === kind);
    if (index < 0) continue;
    // Never drop the last two; shorten the new thing instead of removing it.
    if (kept.length <= 2) break;
    if (kind === 'new') break;
    total -= kept[index]!.minutes;
    kept.splice(index, 1);
  }

  if (total > minutes) {
    const newItem = kept.find((item) => item.kind === 'new');
    if (newItem) {
      newItem.minutes = Math.max(3, newItem.minutes - (total - minutes));
      total = kept.reduce((sum, item) => sum + item.minutes, 0);
    }
  }

  return { items: kept, minutes: total };
}
