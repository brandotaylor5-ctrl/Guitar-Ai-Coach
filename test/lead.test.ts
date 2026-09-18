import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leadChords, leadOverProgression, pitchClassOf } from '../src/create/lead.ts';
import { SONGS } from '../src/songs/library.ts';
import { SCALES, rootPositionFret, scaleBox } from '../src/music/scales.ts';
import { STANDARD_TUNING } from '../src/music/fretboard.ts';

describe('reading chord symbols', () => {
  test('finds the root of the symbols songs actually use', () => {
    assert.equal(pitchClassOf('G'), 7);
    assert.equal(pitchClassOf('Am'), 9);
    assert.equal(pitchClassOf('F#m7'), 6);
    assert.equal(pitchClassOf('Cmaj7'), 0);
    assert.equal(pitchClassOf('Dsus4'), 2);
    assert.equal(pitchClassOf('nonsense'), null);
  });

  test('a major seventh is not a minor chord', () => {
    // The obvious test for "is it minor" is whether there is an m in it, and
    // that makes Cmaj7 minor. A lead built on that plays a flat third over a
    // major chord, every bar, for the whole song.
    assert.equal(leadChords(['Cmaj7'])[0]!.minor, false);
    assert.equal(leadChords(['Am'])[0]!.minor, true);
    assert.equal(leadChords(['Am7'])[0]!.minor, true);
    assert.equal(leadChords(['C'])[0]!.minor, false);
  });

  test('four bars of one chord is one chord to solo over', () => {
    assert.deepEqual(leadChords(['G', 'G', 'G', 'G', 'C', 'C', 'G']).map((c) => c.label),
      ['G', 'C', 'G']);
  });

  test('every chord in every song can be read', () => {
    for (const song of SONGS) {
      const bars = song.sections.flatMap((section) => section.bars);
      for (const bar of bars) {
        assert.notEqual(pitchClassOf(bar), null, `${song.title} has an unreadable chord: ${bar}`);
      }
      assert.ok(leadChords(bars).length >= 2, `${song.title} gives nothing to solo over`);
    }
  });
});

describe('a lead over a song', () => {
  const scaleNotes = (tonicPc: number, id: string) => {
    const scale = SCALES.find((s) => s.id === id)!;
    return scaleBox(tonicPc, scale, STANDARD_TUNING, rootPositionFret(tonicPc, STANDARD_TUNING))
      .positions.map((p) => p.midi).sort((a, b) => a - b);
  };

  test('it lands on notes belonging to the chord underneath', () => {
    const chords = leadChords(['G', 'C', 'D', 'G']);
    const notes = leadOverProgression(chords, scaleNotes(7, 'major-pent'), 0, 1000);
    assert.ok(notes.length >= chords.length, 'at least one note per chord');
    // The first note of each bar should be a chord tone, which is the whole
    // rule the generator exists to teach.
    for (const chord of chords) {
      const inBar = notes.filter((n) => Math.floor(n.startMs / 1000) === chords.indexOf(chord));
      if (!inBar.length) continue;
      const pc = ((inBar[0]!.midi % 12) + 12) % 12;
      const tones = [chord.rootPc, (chord.rootPc + (chord.minor ? 3 : 4)) % 12, (chord.rootPc + 7) % 12];
      assert.ok(tones.includes(pc), `${chord.label} was answered with a note outside it`);
    }
  });

  test('every variant stays inside the scale it was given', () => {
    const notes = scaleNotes(9, 'minor-pent');
    const allowed = new Set(notes.map((m) => m % 12));
    for (let variant = 0; variant < 3; variant++) {
      for (const note of leadOverProgression(leadChords(['Am', 'D', 'E', 'Am']), notes, variant, 1000)) {
        assert.ok(allowed.has(((note.midi % 12) + 12) % 12),
          `variant ${variant} left the scale at midi ${note.midi}`);
      }
    }
  });

  test('variants are actually different lines', () => {
    const notes = scaleNotes(7, 'major-pent');
    const chords = leadChords(['G', 'C', 'D', 'G']);
    const shapes = new Set([0, 1, 2].map((v) =>
      leadOverProgression(chords, notes, v, 1000).map((n) => `${n.midi}@${n.startMs}`).join(' ')));
    assert.equal(shapes.size, 3, 'three variants should give three lines');
  });

  test('notes advance in time and have real durations', () => {
    const line = leadOverProgression(leadChords(['G', 'C']), scaleNotes(7, 'major-pent'), 0, 1000);
    for (let i = 1; i < line.length; i++) {
      assert.ok(line[i]!.startMs >= line[i - 1]!.startMs);
    }
    for (const note of line) assert.ok(note.durationMs > 0);
  });
});
