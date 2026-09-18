import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, chordsIn, songById } from '../src/songs/library.ts';
import {
  LEVEL_NAMES, almostThere, chordThatUnlocksMost, partAt, playableNow, readinessFor, suggestedLevel,
} from '../src/songs/arrange.ts';
import { masteryMap } from '../src/curriculum/mastery.ts';
import { declareKnownChords } from '../src/curriculum/watch.ts';
import { chordShape } from '../src/music/chordShapes.ts';

const knows = (chords: string[]) => masteryMap(declareKnownChords(chords));

describe('the song library', () => {
  test('every song can actually be drawn on a fretboard', () => {
    // A song listing a chord the app cannot show a shape for is a dead end:
    // the player is told to play something and shown nothing.
    for (const song of SONGS) {
      for (const chord of chordsIn(song)) {
        assert.ok(chordShape(chord), `${song.title} needs ${chord}, which has no stored shape`);
      }
    }
  });

  test('every section has a version a complete beginner can play', () => {
    for (const song of SONGS) {
      for (const section of song.sections) {
        assert.ok(section.parts.some((part) => part.level === 'strum'),
          `${song.title} / ${section.name} has no beginner version`);
        assert.ok(section.bars.length > 0);
      }
    }
  });

  test('melody parts carry real notes in guitar range', () => {
    for (const song of SONGS) {
      for (const section of song.sections) {
        const melody = section.parts.find((part) => part.level === 'melody');
        if (!melody) continue;
        assert.ok(melody.notes && melody.notes.length >= 5, `${song.title} melody is too short to be a tune`);
        for (const note of melody.notes!) {
          assert.ok(note.midi >= 40 && note.midi <= 84, `${song.title} has a note at ${note.midi}, off the neck`);
          assert.ok(note.beats > 0);
        }
        const beats = melody.notes!.map((n) => n.beat);
        assert.deepEqual([...beats].sort((a, b) => a - b), beats, `${song.title} melody is out of time order`);
      }
    }
  });

  test('ids are unique and findable', () => {
    assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
    assert.equal(songById('cripple-creek')?.title, 'Cripple Creek');
    assert.equal(songById('nope'), null);
  });

  test('the chords are read off the bars, not a list beside them', () => {
    // A hand-kept list drifts. Wildwood Flower claimed an F it never plays,
    // and the app held the whole song back over a chord that was not in it.
    const wildwood = songById('wildwood-flower')!;
    assert.deepEqual(chordsIn(wildwood).sort(), ['C', 'G']);
  });
});

describe('choosing what someone can play today', () => {
  test('two chords is already a song', () => {
    const playable = playableNow(knows(['G', 'D']));
    assert.ok(playable.length >= 1, 'somebody with G and D can play something');
    assert.equal(playable[0]!.song.title, 'Tom Dooley');
  });

  test('a song you cannot play is never offered as playable', () => {
    for (const readiness of playableNow(knows(['G', 'D']))) {
      assert.equal(readiness.missing.length, 0);
    }
  });

  test('easiest first, not library order', () => {
    const playable = playableNow(knows(['G', 'C', 'D', 'A', 'E', 'Am', 'F']));
    const difficulties = playable.map((r) => r.song.difficulty);
    assert.deepEqual([...difficulties].sort(), difficulties);
  });

  test('it names the one chord that opens the most songs', () => {
    const unlock = chordThatUnlocksMost(knows(['G', 'D']));
    assert.equal(unlock?.chord, 'C');
    assert.ok(unlock!.unlocks.length >= 3, 'C should open several G-key songs at once');
  });

  test('only ever promises a chord that finishes a song on its own', () => {
    // "Learn this and two more chords and you can play it" is not a promise
    // anyone can act on today.
    const unlock = chordThatUnlocksMost(knows(['G']));
    for (const song of unlock?.unlocks ?? []) {
      const missing = readinessFor(song, knows(['G'])).missing;
      assert.equal(missing.length, 1);
      assert.equal(missing[0], unlock!.chord);
    }
  });

  test('almost-there songs are one chord away, never two', () => {
    for (const readiness of almostThere(knows(['G', 'D']))) {
      assert.equal(readiness.missing.length, 1);
    }
  });

  test('somebody who knows nothing is promised nothing', () => {
    assert.equal(playableNow(new Map()).length, 0);
    assert.equal(chordThatUnlocksMost(new Map()), null);
  });
});

describe('meeting a player where their hands are', () => {
  const section = SONGS[0]!.sections[0]!;

  test('a beginner is started on the simplest version', () => {
    assert.equal(suggestedLevel(section, knows(['G', 'D'])), 'strum');
  });

  test('a steady strummer moves up without being asked', () => {
    const mastery = masteryMap([
      ...declareKnownChords(['G', 'D']),
      { skillId: 'technique.steady-strum', quality: 0.95, at: Date.now(), source: 'drill' as const },
    ]);
    assert.equal(suggestedLevel(section, mastery), 'boom-chuck');
  });

  test('never suggests a version the section does not have', () => {
    const everything = masteryMap([
      ...declareKnownChords(['G', 'C', 'D', 'A', 'E', 'Am', 'F']),
      ...['technique.steady-strum', 'technique.alternate-picking', 'technique.clean-notes']
        .map((skillId) => ({ skillId, quality: 0.95, at: Date.now(), source: 'drill' as const })),
    ]);
    for (const song of SONGS) {
      for (const s of song.sections) {
        const level = suggestedLevel(s, everything);
        assert.ok(s.parts.some((part) => part.level === level),
          `${song.title} / ${s.name} was offered a ${level} version it does not have`);
      }
    }
  });

  test('every level has a name a player would recognise', () => {
    for (const song of SONGS) {
      for (const s of song.sections) {
        for (const part of s.parts) {
          assert.ok(LEVEL_NAMES[part.level], `no name for ${part.level}`);
          assert.ok(part.how.length > 20, 'each version has to say what to actually do');
          assert.equal(partAt(s, part.level).level, part.level);
        }
      }
    }
  });
});
