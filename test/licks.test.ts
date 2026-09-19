import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LICKS, lickById, lickToEvents, licksForScale, licksInKey, transposeLick } from '../src/music/licks.ts';
import { SCALES } from '../src/music/scales.ts';

const scaleOf = (id: string) => SCALES.find((s) => s.id === id)!;
const pcs = (lick: { tonicPc: number; scaleId: string }) =>
  new Set(scaleOf(lick.scaleId).degrees.map((d) => (lick.tonicPc + d) % 12));

describe('the licks are actually made of music', () => {
  test('every note belongs to the scale the lick claims', () => {
    // A lick that wanders outside its own scale is the difference between
    // sounding like the style and sounding like a mistake.
    for (const lick of LICKS) {
      const allowed = pcs(lick);
      for (const note of lick.notes) {
        assert.ok(allowed.has(((note.midi % 12) + 12) % 12),
          `${lick.name} plays ${note.midi} which is outside ${lick.scaleId} on ${lick.tonicPc}`);
      }
    }
  });

  test('every lick resolves onto a note of the home chord', () => {
    // Root, third or fifth. This is what makes a phrase sound finished
    // instead of abandoned, and it is the whole reason these are worth
    // learning rather than generating.
    for (const lick of LICKS) {
      const lastBeat = Math.max(...lick.notes.map((n) => n.beat));
      const finals = lick.notes.filter((n) => n.beat === lastBeat);
      const tones = [0, 3, 4, 7].map((d) => (lick.tonicPc + d) % 12);
      assert.ok(finals.some((n) => tones.includes(((n.midi % 12) + 12) % 12)),
        `${lick.name} does not land on a chord tone`);
    }
  });

  test('every lick is playable on a guitar', () => {
    for (const lick of LICKS) {
      for (const note of lick.notes) {
        assert.ok(note.midi >= 40 && note.midi <= 84, `${lick.name} has a note off the neck: ${note.midi}`);
        assert.ok(note.beats > 0, `${lick.name} has a note with no length`);
        assert.ok(note.beat >= 0);
      }
      const span = Math.max(...lick.notes.map((n) => n.midi)) - Math.min(...lick.notes.map((n) => n.midi));
      assert.ok(span <= 24, `${lick.name} spans ${span} semitones, which is not one phrase`);
    }
  });

  test('notes are written in time order', () => {
    for (const lick of LICKS) {
      const beats = lick.notes.map((n) => n.beat);
      assert.deepEqual([...beats].sort((a, b) => a - b), beats, `${lick.name} is out of order`);
    }
  });

  test('each one says when to use it and why it works', () => {
    for (const lick of LICKS) {
      assert.ok(lick.useWhen.length > 30, `${lick.name} needs to say when to reach for it`);
      assert.ok(lick.why.length > 40, `${lick.name} needs to explain what makes it work`);
      assert.ok(!/\b(diatonic|dominant|subdominant|cadence|voicing)\b/i.test(lick.why),
        `${lick.name} explains itself in words a beginner would have to look up`);
    }
  });

  test('ids unique, and findable', () => {
    assert.equal(new Set(LICKS.map((l) => l.id)).size, LICKS.length);
    assert.equal(lickById('g-run')?.tradition, 'bluegrass');
    assert.equal(lickById('nope'), null);
  });

  test('there is real breadth, not one style', () => {
    const traditions = new Set(LICKS.map((l) => l.tradition));
    assert.ok(traditions.size >= 4, `only ${traditions.size} traditions represented`);
    assert.ok(LICKS.some((l) => l.difficulty === 1), 'a beginner needs somewhere to start');
  });
});

describe('moving a lick to another key', () => {
  test('transposing keeps every note in the new scale', () => {
    for (const lick of LICKS) {
      for (const toPc of [0, 2, 4, 5, 7, 9, 11]) {
        const moved = transposeLick(lick, toPc);
        const allowed = pcs(moved);
        for (const note of moved.notes) {
          assert.ok(allowed.has(((note.midi % 12) + 12) % 12),
            `${lick.name} moved to ${toPc} left its scale`);
        }
      }
    }
  });

  test('transposing preserves the shape exactly', () => {
    const lick = lickById('g-run')!;
    const moved = transposeLick(lick, 0);
    const before = lick.notes.map((n, i) => n.midi - lick.notes[0]!.midi);
    const after = moved.notes.map((n, i) => n.midi - moved.notes[0]!.midi);
    assert.deepEqual(after, before, 'the intervals must not change');
  });

  test('transposing does not push licks off the neck', () => {
    for (const lick of LICKS) {
      for (let toPc = 0; toPc < 12; toPc++) {
        for (const note of transposeLick(lick, toPc).notes) {
          assert.ok(note.midi >= 38 && note.midi <= 88,
            `${lick.name} in ${toPc} goes to ${note.midi}, off the instrument`);
        }
      }
    }
  });

  test('a lick already in the key is left alone', () => {
    const lick = lickById('g-run')!;
    assert.deepEqual(licksForScale('major-pent', 7).find((l) => l.id === 'g-run')!.notes, lick.notes);
  });
});

describe('finding a lick that fits', () => {
  test('a scale offers its own licks', () => {
    const found = licksForScale('blues', 9);
    assert.ok(found.length >= 2);
    for (const lick of found) assert.equal(lick.scaleId, 'blues');
  });

  test('a key offers licks across the scales that suit it', () => {
    const major = licksInKey(7, false);
    const minor = licksInKey(9, true);
    assert.ok(major.length >= 3, 'a major key should have several licks');
    assert.ok(minor.length >= 3, 'a minor key should have several licks');
    assert.ok(major.every((l) => l.tonicPc === 7));
    // Easiest first, so a beginner is not handed the double stops.
    assert.deepEqual(major.map((l) => l.difficulty), [...major.map((l) => l.difficulty)].sort());
  });

  test('licks become playable events in order', () => {
    for (const lick of LICKS) {
      const events = lickToEvents(lick, 96);
      assert.equal(events.length, lick.notes.length);
      for (let i = 1; i < events.length; i++) {
        assert.ok(events[i]!.startMs >= events[i - 1]!.startMs);
      }
      for (const event of events) assert.ok(event.durationMs > 0);
    }
  });
});

describe('a lick that has been moved does not lie about itself', () => {
  test('no name carries a key that transposing would make wrong', () => {
    // "Carter bass run in C" appeared, transposed into G, on a song in G. The
    // notes were right and the label was false.
    for (const lick of LICKS) {
      assert.doesNotMatch(lick.name, /\bin [A-G]#?( minor| major)?\b/,
        `${lick.name} names a key that will be wrong once it is moved`);
    }
  });

  test('nor does the text about when and why to use it', () => {
    for (const lick of LICKS) {
      for (const [field, text] of [['useWhen', lick.useWhen], ['why', lick.why]] as const) {
        assert.doesNotMatch(text, /\b(in|over) (an? )?[A-G]#?( minor| major)? (chord|progression|blues)\b/,
          `${lick.name}.${field} names a key that will be wrong once it is moved`);
      }
    }
  });
});
