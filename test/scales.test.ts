import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALES, degreeRole, rootPositionFret, scaleBox, scaleMidiRange, scaleNoteNames, scaleRun,
} from '../src/music/scales.ts';
import { DROP_D_TUNING, STANDARD_TUNING, withCapo } from '../src/music/fretboard.ts';
import { inventRiff, riffToEvents, starterRiffs, varyRiff } from '../src/curriculum/riffs.ts';

const minorPent = SCALES.find((s) => s.id === 'minor-pent')!;
const majorPent = SCALES.find((s) => s.id === 'major-pent')!;

describe('scales as shapes', () => {
  test('A minor pentatonic is the five notes everyone learns first', () => {
    assert.deepEqual(scaleNoteNames(9, minorPent), ['A', 'C', 'D', 'E', 'G']);
  });

  test('C major pentatonic is the bright five', () => {
    assert.deepEqual(scaleNoteNames(0, majorPent), ['C', 'D', 'E', 'G', 'A']);
  });

  test('the box starts where the root is, not wherever fret zero happens to be', () => {
    // A minor pentatonic in standard tuning lives at the fifth fret because
    // that is where A is on the low string. Getting this wrong gives a player
    // the right notes in a shape they will never recognise again.
    assert.equal(rootPositionFret(9, STANDARD_TUNING), 5);
    const box = scaleBox(9, minorPent, STANDARD_TUNING, 5);
    const lowest = box.positions.reduce((a, b) => (a.midi <= b.midi ? a : b));
    assert.ok(lowest.isRoot, 'the lowest note in the box should be the root');
    assert.equal(lowest.fret, 5);
  });

  test('every note in the box belongs to the scale', () => {
    const wanted = new Set(minorPent.degrees.map((d) => (9 + d) % 12));
    for (const position of scaleBox(9, minorPent, STANDARD_TUNING, 5).positions) {
      assert.ok(wanted.has(((position.midi % 12) + 12) % 12), `${position.midi} is not in A minor pentatonic`);
    }
  });

  test('the shape follows the tuning rather than a memorised fret pattern', () => {
    // A box hard-coded for standard tuning is simply wrong in drop D, and the
    // app lets people retune and capo. So the shape is derived, and the test
    // that matters is that it stays inside the scale whatever the tuning.
    for (const tuning of [DROP_D_TUNING, withCapo(STANDARD_TUNING, 3)]) {
      const box = scaleBox(4, minorPent, tuning, rootPositionFret(4, tuning));
      assert.ok(box.positions.length >= 8, 'a box should have a playable number of notes');
      const wanted = new Set(minorPent.degrees.map((d) => (4 + d) % 12));
      for (const position of box.positions) {
        assert.ok(wanted.has(((position.midi % 12) + 12) % 12));
      }
    }
  });

  test('a run goes up and comes back down', () => {
    const run = scaleRun(9, minorPent, STANDARD_TUNING, 5);
    const peak = run.reduce((best, p, i) => (p.midi > run[best]!.midi ? i : best), 0);
    assert.ok(peak > 0 && peak < run.length - 1, 'the highest note should be in the middle');
    assert.equal(run[0]!.midi, run[run.length - 1]!.midi, 'it should finish where it started');
  });

  test('every degree has words a beginner can act on', () => {
    for (const scale of SCALES) {
      for (const degree of scale.degrees) {
        const { short, role } = degreeRole(degree);
        assert.ok(short.length > 0 && role.length > 10, `degree ${degree} needs a description`);
        assert.doesNotMatch(role, /interval|semitone|diatonic/i, 'roles should be plain language');
      }
    }
  });

  test('a midi range climbs without repeating itself', () => {
    const notes = scaleMidiRange(9, minorPent, 40, 10);
    assert.equal(notes.length, 10);
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i]! > notes[i - 1]!);
  });
});

describe('riffs for someone with no riffs yet', () => {
  test('an invented riff only uses notes from the scale', () => {
    const wanted = new Set(minorPent.degrees.map((d) => (9 + d) % 12));
    for (let seed = 0; seed < 40; seed++) {
      const riff = inventRiff(minorPent, 9, 45, seed);
      for (const note of riff.notes) {
        assert.ok(wanted.has(((note.midi % 12) + 12) % 12),
          `seed ${seed} produced ${note.name}, which is outside A minor pentatonic`);
      }
    }
  });

  test('an invented riff is a phrase, not a shower of notes', () => {
    for (let seed = 0; seed < 20; seed++) {
      const riff = inventRiff(majorPent, 0, 48, seed);
      assert.ok(riff.notes.length >= 5 && riff.notes.length <= 12, 'a riff should be hummable');
      assert.ok(riff.why.length >= 3, 'every riff has to explain itself');
      const span = Math.max(...riff.notes.map((n) => n.midi)) - Math.min(...riff.notes.map((n) => n.midi));
      assert.ok(span <= 24, `seed ${seed} spans ${span} semitones, which is not one phrase`);
    }
  });

  test('every note is explained in words, not theory', () => {
    const riff = inventRiff(minorPent, 9, 45, 7);
    for (const note of riff.notes) {
      assert.ok(note.role.length > 10);
      assert.ok(note.shortRole.length > 0);
    }
  });

  test('different seeds give different riffs', () => {
    const shapes = new Set(Array.from({ length: 12 }, (_, i) =>
      inventRiff(minorPent, 9, 45, i).notes.map((n) => `${n.midi}:${n.beats}`).join(' ')));
    assert.ok(shapes.size >= 6, `expected variety, got ${shapes.size} distinct riffs from 12 seeds`);
  });

  test('varying a riff keeps it in the scale and changes something', () => {
    const wanted = new Set(minorPent.degrees.map((d) => (9 + d) % 12));
    const riff = inventRiff(minorPent, 9, 45, 3);
    const before = riff.notes.map((n) => `${n.midi}:${n.beats}`).join(' ');
    let changed = 0;
    for (let seed = 0; seed < 20; seed++) {
      const variant = varyRiff(riff, minorPent, 9, 45, seed);
      for (const note of variant.notes) {
        assert.ok(wanted.has(((note.midi % 12) + 12) % 12), `${note.name} left the scale`);
      }
      if (variant.notes.map((n) => `${n.midi}:${n.beats}`).join(' ') !== before) changed += 1;
    }
    assert.ok(changed >= 18, `variation should change the riff, only ${changed}/20 did`);
  });

  test('riffs turn into playable events in order', () => {
    const events = riffToEvents(inventRiff(minorPent, 9, 45, 11), 84);
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i]!.startMs > events[i - 1]!.startMs, 'notes must advance in time');
      assert.ok(events[i]!.durationMs > 0);
    }
  });

  test('starter riffs are handed out ready to play', () => {
    const riffs = starterRiffs(minorPent, 4, 40, 3);
    assert.equal(riffs.length, 3);
    assert.equal(new Set(riffs.map((r) => r.id)).size, 3);
  });
});
