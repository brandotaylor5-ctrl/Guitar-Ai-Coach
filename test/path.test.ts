import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PATH, loadProgress, saveDone, stepById } from '../src/curriculum/path.ts';
import { songById, chordsIn } from '../src/songs/library.ts';
import { getSkill } from '../src/curriculum/skills.ts';
import { chordShape } from '../src/music/chordShapes.ts';

function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('a course that works before it has heard you', () => {
  // A person who could not play guitar opened this app and every screen asked
  // them to play something first. The whole point of this module is that it
  // says something on a completely cold start.

  test('there is real teaching content without any setup at all', () => {
    const { current, completed } = loadProgress(fakeStore());
    assert.equal(completed, 0);
    assert.equal(current.id, PATH[0]!.id);
    assert.ok(current.steps.length >= 3, 'the first step has to actually tell you what to do');
  });

  test('it starts from never having held a guitar', () => {
    assert.equal(PATH[0]!.kind, 'know');
    assert.match(PATH[0]!.title.toLowerCase(), /hold/);
  });

  test('every step says what to do, how to know, and how long', () => {
    for (const step of PATH) {
      assert.ok(step.steps.length >= 3, `${step.id} needs real instructions`);
      for (const line of step.steps) {
        assert.ok(line.length > 15, `${step.id} has a throwaway instruction: "${line}"`);
      }
      assert.ok(step.check.length > 15, `${step.id} needs a way to know you have it`);
      assert.ok(step.expect.length > 5, `${step.id} needs an honest time estimate`);
      assert.ok(step.outcome.length > 15 && step.why.length > 25, `${step.id} needs an outcome and a reason`);
    }
  });

  test('the scales a beginner asks about are in it, and visible from the start', () => {
    const ids = PATH.map((step) => step.id);
    assert.ok(ids.includes('scale-minor-pent'), 'minor pentatonic has to be in the course');
    assert.ok(ids.includes('scale-major-pent'), 'major pentatonic has to be in the course');
    // Visible means in the list from step one, not unlocked later. The count
    // is not fixed — what matters is that the scales are all in the one list.
    assert.ok(PATH.filter((s) => s.kind === 'scale').length >= 2);
  });

  test('it ends somewhere worth getting to', () => {
    assert.equal(PATH[PATH.length - 1]!.kind, 'create');
  });

  test('physical skills come before the chords that need them', () => {
    const index = (id: string) => PATH.findIndex((step) => step.id === id);
    assert.ok(index('fret') < index('chord-em'), 'fretting a note comes before a chord');
    assert.ok(index('chord-em') < index('change'), 'a chord comes before changing between two');
    assert.ok(index('chord-g') < index('chord-d'), 'G is taught before D in the first-song family');
    assert.ok(index('chord-d') < index('change'), 'both song chords come before practising their change');
    assert.ok(index('change') < index('first-song'), 'the exact song change comes before the first song');
    assert.ok(index('clean-notes') < index('scale-minor-pent'), 'picking comes before a scale');
    assert.ok(index('scale-minor-pent') < index('first-riff'), 'a scale comes before writing with it');
  });

  test('every practice link points somewhere that exists', () => {
    const views = new Set(['lessons', 'session', 'songs', 'song']);
    for (const step of PATH) {
      if (!step.practice) continue;
      assert.ok(views.has(step.practice.view), `${step.id} links to a view that is not real`);
      assert.ok(step.practice.label.length > 5, `${step.id} needs a real button label`);
      const songId = step.practice.params?.song;
      if (songId) assert.ok(songById(songId), `${step.id} links to a song that does not exist: ${songId}`);
    }
  });

  test('course practice links to exact adaptive skills when it names one', () => {
    for (const step of PATH) {
      const skillId = step.practice?.params?.skill;
      if (!skillId) continue;
      assert.ok(getSkill(skillId), `${step.id} points to missing skill ${skillId}`);
      assert.equal(step.practice?.params?.path, step.id,
        `${step.id} must carry its course id into practice so success can advance the course`);
    }
  });

  test('every course button that opens Adaptive lessons names the exact skill', () => {
    for (const step of PATH) {
      if (step.practice?.view !== 'lessons') continue;
      assert.ok(step.practice.params?.skill,
        `${step.id} opens Adaptive lessons without naming what to teach`);
      assert.ok(step.practice.params?.path,
        `${step.id} opens Adaptive lessons without a path id to bring completion back`);
    }
  });

  test('the first complete song only arrives after G, D and their change', () => {
    const index = (id: string) => PATH.findIndex((step) => step.id === id);
    assert.ok(index('chord-g') < index('first-song'));
    assert.ok(index('chord-d') < index('first-song'));
    assert.ok(index('change') < index('first-song'));
  });

  test('pentatonic comes before legato techniques that depend on it', () => {
    const index = (id: string) => PATH.findIndex((step) => step.id === id);
    assert.ok(index('scale-minor-pent') < index('hammer-on'));
    assert.ok(index('hammer-on') < index('pull-off'));
  });

  test('every chord the course teaches has a concrete beginner finger map', () => {
    for (const step of PATH) {
      if (!step.chord) continue;
      assert.ok(chordShape(step.chord), `${step.id} teaches ${step.chord} without a stored physical shape`);
    }
  });

  test('a song is never assigned before every chord in it has appeared in the course', () => {
    const taught = new Set<string>();
    for (const step of PATH) {
      if (step.kind === 'song' && step.practice?.params?.song) {
        const song = songById(step.practice.params.song);
        assert.ok(song, `${step.id} points to a missing song`);
        for (const chord of chordsIn(song!)) {
          assert.ok(taught.has(chord),
            `${step.id} assigns ${song!.title} before teaching ${chord}`);
        }
      }
      if (step.chord) taught.add(step.chord);
      for (const chord of step.chords ?? []) taught.add(chord);
    }
  });

  test('no jargon a beginner would have to look up', () => {
    const jargon = /\b(diatonic|tonic|subdominant|arpeggiate|inversion|voicing|modal)\b/i;
    for (const step of PATH) {
      for (const text of [step.outcome, step.why, step.check, ...step.steps]) {
        assert.doesNotMatch(text, jargon, `${step.id} uses a word a beginner would have to look up`);
      }
    }
  });

  test('ids are unique and findable', () => {
    assert.equal(new Set(PATH.map((s) => s.id)).size, PATH.length);
    assert.equal(stepById('scale-minor-pent')?.kind, 'scale');
    assert.equal(stepById('nope'), null);
  });
});

describe('remembering where someone got to', () => {
  test('finishing a step moves the course on', () => {
    const store = fakeStore();
    saveDone(store, new Set([PATH[0]!.id]));
    const progress = loadProgress(store);
    assert.equal(progress.completed, 1);
    assert.equal(progress.current.id, PATH[1]!.id);
  });

  test('skipping ahead still puts you at the first unfinished step', () => {
    const store = fakeStore();
    saveDone(store, new Set([PATH[3]!.id]));
    assert.equal(loadProgress(store).current.id, PATH[0]!.id);
  });

  test('a finished course stays on the last step rather than breaking', () => {
    const store = fakeStore();
    saveDone(store, new Set(PATH.map((s) => s.id)));
    const progress = loadProgress(store);
    assert.equal(progress.completed, PATH.length);
    assert.equal(progress.current.id, PATH[PATH.length - 1]!.id);
  });

  test('corrupt storage does not stop the course being taught', () => {
    const store = { getItem: () => '{not json', setItem: () => {} };
    const progress = loadProgress(store);
    assert.equal(progress.completed, 0);
    assert.equal(progress.current.id, PATH[0]!.id);
  });

  test('storage that refuses to write is not an error', () => {
    assert.doesNotThrow(() => saveDone({ setItem: () => { throw new Error('quota'); } }, new Set(['hold'])));
  });
});

describe('the course does not go stale as content is added', () => {
  test('no step hard-codes how many songs or steps there are', () => {
    // "Three chords, five songs" was still saying five after the repertoire
    // grew to fourteen. Counts written into prose rot silently.
    const numbers = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(songs|steps|tunes)\b/i;
    for (const step of PATH) {
      for (const text of [step.title, step.outcome, ...step.steps, step.check]) {
        assert.doesNotMatch(text, numbers,
          `${step.id} hard-codes a count that will rot: "${text}"`);
      }
    }
  });

  test('every song a step names still exists', () => {
    for (const step of PATH) {
      const id = step.practice?.params?.song;
      if (id) assert.ok(songById(id), `${step.id} points at a song that is gone: ${id}`);
    }
  });
});
