import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_TUNING } from '../src/music/fretboard.ts';
import { scaleById } from '../src/music/scales.ts';
import {
  RIFF_LESSONS, buildRiffStudy, developStudy, neckZones, rootLocations,
} from '../src/curriculum/riffSchool.ts';

const aMinorPent = scaleById('minor-pent')!;
const aPc = 9;

describe('Riff School neck map', () => {
  test('A minor pentatonic begins at the fifth fret and keeps moving up the neck', () => {
    const zones = neckZones(aPc, aMinorPent, STANDARD_TUNING);
    assert.equal(zones[0]?.startFret, 5);
    assert.ok(zones.length >= 5);
    for (let i = 1; i < zones.length; i++) {
      assert.ok(zones[i]!.startFret > zones[i - 1]!.startFret);
    }
  });

  test('every zone contains only notes from the selected scale', () => {
    const allowed = new Set(aMinorPent.degrees.map((degree) => (aPc + degree) % 12));
    for (const zone of neckZones(aPc, aMinorPent, STANDARD_TUNING)) {
      for (const position of zone.box.positions) {
        assert.ok(allowed.has(position.midi % 12));
      }
    }
  });

  test('root map shows A on multiple strings inside the first twelve frets', () => {
    const roots = rootLocations(aPc, STANDARD_TUNING, 12);
    assert.ok(roots.length >= 4);
    assert.ok(roots.some((root) => root.stringNumber === 6 && root.fret === 5));
    assert.ok(roots.every((root) => root.midi % 12 === aPc));
  });
});

describe('Riff School studies', () => {
  test('every study stays in scale and has one physical fret position per note', () => {
    const allowed = new Set(aMinorPent.degrees.map((degree) => (aPc + degree) % 12));
    const zones = neckZones(aPc, aMinorPent, STANDARD_TUNING);
    for (const lesson of RIFF_LESSONS) {
      const study = buildRiffStudy(lesson, zones[0]!, aPc, aMinorPent);
      assert.equal(study.events.length, lesson.offsets.length);
      assert.equal(study.positions.length, study.events.length);
      assert.equal(study.roles.length, study.events.length);
      for (const event of study.events) assert.ok(allowed.has(event.midi % 12), lesson.id);
      for (const position of study.positions) {
        assert.ok(position.fret >= zones[0]!.startFret);
        assert.ok(position.fret <= zones[0]!.highFret);
      }
    }
  });

  test('the same lesson can be rebuilt higher on the neck without changing its concept', () => {
    const zones = neckZones(aPc, aMinorPent, STANDARD_TUNING);
    const low = buildRiffStudy(RIFF_LESSONS[1]!, zones[0]!, aPc, aMinorPent);
    const high = buildRiffStudy(RIFF_LESSONS[1]!, zones[1]!, aPc, aMinorPent);
    assert.equal(low.lesson.id, high.lesson.id);
    assert.notDeepEqual(low.positions, high.positions);
    assert.ok(Math.min(...high.positions.map((p) => p.fret)) >= zones[1]!.startFret);
  });

  test('songwriting variations alter one dimension without leaving guitar range', () => {
    const zone = neckZones(aPc, aMinorPent, STANDARD_TUNING)[0]!;
    const study = buildRiffStudy(RIFF_LESSONS[2]!, zone, aPc, aMinorPent);
    const variants = developStudy(study, aMinorPent, aPc);
    assert.equal(new Set(variants.map((v) => v.kind)).size, 4);
    for (const variant of variants) {
      assert.ok(variant.events.length >= 2);
      assert.ok(variant.events.every((event) => event.midi >= 40 && event.midi <= 88));
      for (let i = 1; i < variant.events.length; i++) {
        assert.ok(variant.events[i]!.startMs > variant.events[i - 1]!.startMs);
      }
    }
  });

  test('every lesson teaches a musical idea, not a named copyrighted riff', () => {
    assert.equal(new Set(RIFF_LESSONS.map((lesson) => lesson.id)).size, RIFF_LESSONS.length);
    for (const lesson of RIFF_LESSONS) {
      assert.ok(lesson.focus.length > 15);
      assert.ok(lesson.instruction.length > 25);
      assert.ok(lesson.listenFor.length > 25);
      assert.doesNotMatch(lesson.name, /Tame Impala|Beatles|Nirvana|Hendrix|Zeppelin/i);
    }
  });
});
