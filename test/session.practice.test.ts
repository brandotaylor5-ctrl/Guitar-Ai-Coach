import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession } from '../src/curriculum/session.ts';
import { PATH } from '../src/curriculum/path.ts';
import { masteryMap } from '../src/curriculum/mastery.ts';
import { declareKnownChords } from '../src/curriculum/watch.ts';

// Real time, because mastery decays against the clock: a fixed date in the
// past makes every skill look forgotten regardless of what the test set up.
const NOW = Date.now();
const beginner = new Map();
const playing = masteryMap(declareKnownChords(['G', 'C', 'D', 'Em', 'Am']));

describe('a practice session, not a menu', () => {
  test('a complete beginner still gets a real session', () => {
    const session = buildSession(PATH[0]!, beginner, 15, NOW);
    assert.ok(session.items.length >= 3, 'even with nothing known there is a session');
    for (const item of session.items) {
      assert.ok(item.minutes > 0);
      assert.ok(item.what.length > 25, `"${item.title}" does not say what to do`);
      assert.ok(item.because.length > 30, `"${item.title}" does not say why it is there`);
    }
  });

  test('it is ordered the way a teacher orders a lesson', () => {
    const session = buildSession(PATH[5]!, playing, 20, NOW);
    const kinds = session.items.map((item) => item.kind);
    const order = ['warm-up', 'new', 'review', 'song', 'play'];
    const positions = kinds.map((kind) => order.indexOf(kind));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b),
      `out of teaching order: ${kinds.join(' → ')}`);
  });

  test('it warms up before it asks for anything hard', () => {
    assert.equal(buildSession(PATH[5]!, playing, 20, NOW).items[0]!.kind, 'warm-up');
  });

  test('it ends on music rather than on a drill', () => {
    const session = buildSession(PATH[5]!, playing, 20, NOW);
    const last = session.items[session.items.length - 1]!;
    assert.ok(last.kind === 'play' || last.kind === 'song', `ended on ${last.kind}`);
  });

  test('it fits the time you actually have', () => {
    for (const minutes of [5, 10, 15, 20, 30]) {
      const session = buildSession(PATH[5]!, playing, minutes, NOW);
      assert.ok(session.minutes <= minutes,
        `asked for ${minutes} minutes and got ${session.minutes}`);
      assert.equal(session.minutes, session.items.reduce((s, i) => s + i.minutes, 0));
    }
  });

  test('a short session loses the extras, never the new thing', () => {
    const session = buildSession(PATH[5]!, playing, 5, NOW);
    assert.ok(session.items.some((item) => item.kind === 'new'), 'the new thing has to survive');
    const newItem = session.items.find((item) => item.kind === 'new')!;
    assert.ok(newItem.minutes >= 3, 'and keep enough time to be worth doing');
  });

  test('the new thing is whatever the course is up to', () => {
    for (const step of [PATH[0]!, PATH[7]!, PATH[12]!]) {
      const session = buildSession(step, playing, 20, NOW);
      assert.equal(session.items.find((item) => item.kind === 'new')!.title, step.title);
    }
  });

  test('the song slot always names a song, and never lies about it', () => {
    // It used to be headed "Play something whole" and then say "open Songs and
    // listen to one you cannot play yet" — naming nothing. A heading that
    // promises a song has to be followed by a song.
    const song = buildSession(PATH[0]!, beginner, 20, NOW).items.find((i) => i.kind === 'song')!;
    assert.ok(song, 'there is always a song slot');
    assert.ok(song.goTo?.params?.song, 'it points at a specific song');
    assert.match(song.title, /\w/);
    // For somebody who cannot play it, it must say so rather than instruct.
    assert.match(song.what, /cannot play it yet/i);
    assert.notEqual(song.label, undefined, 'and it is not headed "play something whole"');
  });

  test('a player who can play something is told to play it, by name', () => {
    const song = buildSession(PATH[5]!, playing, 20, NOW).items.find((i) => i.kind === 'song')!;
    assert.match(song.title, /^Play .+ all the way through$/);
    assert.ok(song.goTo?.params?.song);
  });

  test('the new thing carries its real instructions, not a pointer', () => {
    const item = buildSession(PATH[0]!, beginner, 20, NOW).items.find((i) => i.kind === 'new')!;
    assert.ok(item.do && item.do.length >= 3, 'the steps have to be on the card');
    assert.deepEqual(item.do, PATH[0]!.steps);
  });

  test('a complete beginner is not told to mess about with nothing', () => {
    const item = buildSession(PATH[0]!, beginner, 20, NOW).items.find((i) => i.kind === 'play')!;
    assert.doesNotMatch(item.title, /whatever you want/i);
    assert.ok(item.what.length > 40, 'give them something concrete instead');
  });

  test('something going stale gets brought back', () => {
    // Genuinely known, then left alone. One observation is not "known" — the
    // mastery model builds from evidence across sessions, and a single drill
    // at 0.6 only reaches 0.14, which is correct and is not a stale skill.
    const twelveDaysAgo = NOW - 12 * 86_400_000;
    const stale = masteryMap([
      ...declareKnownChords(['G', 'C', 'D']),
      ...declareKnownChords(['Am']).map((o) => ({ ...o, at: twelveDaysAgo })),
    ]);
    const session = buildSession(PATH[5]!, stale, 25, NOW);
    const review = session.items.find((item) => item.kind === 'review');
    assert.ok(review, 'a skill twelve days old should come back');
    assert.match(review!.what, /days ago/);
  });

  test('nothing stale means no review slot inventing work', () => {
    const fresh = masteryMap(declareKnownChords(['G', 'C', 'D']).map((o) => ({ ...o, at: NOW })));
    const session = buildSession(PATH[5]!, fresh, 25, NOW);
    assert.equal(session.items.some((item) => item.kind === 'review'), false);
  });

  test('every destination is somewhere that exists', () => {
    const views = new Set(['path', 'session', 'songs', 'song', 'lessons']);
    for (const mastery of [beginner, playing]) {
      for (const item of buildSession(PATH[5]!, mastery, 20, NOW).items) {
        if (item.goTo) assert.ok(views.has(item.goTo.view), `${item.title} goes nowhere real`);
      }
    }
  });

  test('the song changes from day to day rather than nagging', () => {
    const titles = new Set([0, 1, 2, 3, 4].map((day) =>
      buildSession(PATH[5]!, playing, 20, NOW + day * 86_400_000)
        .items.find((item) => item.kind === 'song')?.title));
    assert.ok(titles.size >= 2, 'the same song every day is how a routine goes stale');
  });
});

describe('the session never sends you after a button that is not there', () => {
  test('the beginner song slot names the control the song page actually has', () => {
    // It said 'press Hear it' and the button is called 'Hear the whole song'.
    // Small, and exactly the kind of thing that makes an app feel broken.
    const song = buildSession(PATH[0]!, beginner, 20, NOW).items.find((i) => i.kind === 'song')!;
    const quoted = [...song.what.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(quoted.length > 0, 'it should name the control it wants pressed');
    for (const label of quoted) {
      assert.ok(SONG_PAGE_BUTTONS.includes(label!), `the song page has no button called "${label}"`);
    }
  });
});

/** Controls the song page offers, whether or not the song can be played. */
const SONG_PAGE_BUTTONS = [
  'Hear the whole song', 'Play along', 'Just the chords', 'Bass and strum', 'The melody',
];
