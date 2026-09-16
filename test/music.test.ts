import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  centsOffset, contourOf, frequencyToMidi, intervalName, intervalsOf,
  midiToFrequency, midiToName, nameToMidi, octaveOf, pcToName, pitchClass,
} from '../src/music/notes.ts';
import {
  DROP_D_TUNING, STANDARD_TUNING, inferFingering, positionsFor, renderTab,
} from '../src/music/fretboard.ts';
import { estimateScale, homePitchClass, scaleAlternatives, thirdQuality } from '../src/music/key.ts';
import { estimateRhythm, rhythmShape, tempoRatio, timingSteadiness } from '../src/music/rhythm.ts';
import { seq } from './helpers.ts';

describe('notes', () => {
  test('MIDI 40 is the open low E string', () => {
    assert.equal(midiToName(40), 'E2');
    assert.equal(nameToMidi('E2'), 40);
    assert.equal(Math.round(midiToFrequency(40) * 100) / 100, 82.41);
  });

  test('round-trips every note across the guitar range', () => {
    for (let midi = 40; midi <= 88; midi++) {
      assert.equal(nameToMidi(midiToName(midi)), midi, `failed at ${midi}`);
    }
  });

  test('parses flats and sharps to the same pitch', () => {
    assert.equal(nameToMidi('Eb3'), nameToMidi('D#3'));
    assert.equal(pitchClass(nameToMidi('Gb4')), pitchClass(nameToMidi('F#2')));
  });

  test('rejects things that are not note names', () => {
    assert.throws(() => nameToMidi('H2'));
    assert.throws(() => nameToMidi('banana'));
  });

  test('frequency conversion is its own inverse', () => {
    for (const midi of [40, 45, 55, 64, 76]) {
      assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi)) - midi) < 1e-9);
    }
  });

  test('reports how far off a frequency is, in cents', () => {
    assert.equal(centsOffset(midiToFrequency(40)), 0);
    assert.ok(Math.abs(centsOffset(midiToFrequency(40) * Math.pow(2, 10 / 1200)) - 10) <= 1);
  });

  test('octave numbering follows scientific pitch notation', () => {
    assert.equal(octaveOf(60), 4);
    assert.equal(pcToName(pitchClass(60)), 'C');
  });

  test('names intervals the way musicians do', () => {
    assert.equal(intervalName(3), 'minor third');
    assert.equal(intervalName(4), 'major third');
    assert.equal(intervalName(7), 'perfect fifth');
    assert.equal(intervalName(12), 'octave');
  });

  test('derives intervals and contour from a line', () => {
    const midis = seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']).map((n) => n.midi);
    assert.deepEqual(intervalsOf(midis), [3, 2, 2, -4, -3]);
    assert.deepEqual(contourOf(midis), [1, 1, 1, -1, -1]);
  });
});

describe('fretboard', () => {
  test('finds every place a pitch can be played', () => {
    // E3 sits on exactly three strings within 22 frets: 12th, 7th and 2nd.
    const positions = positionsFor(nameToMidi('E3'), STANDARD_TUNING);
    assert.equal(positions.length, 3);
    for (const p of positions) {
      assert.equal(STANDARD_TUNING.strings[p.string]! + p.fret, nameToMidi('E3'));
    }
  });

  test('fingers the low E riff where a guitarist actually would', () => {
    const midis = seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']).map((n) => n.midi);
    assert.deepEqual(inferFingering(midis), [
      { string: 0, fret: 0 }, { string: 0, fret: 3 }, { string: 1, fret: 0 },
      { string: 1, fret: 2 }, { string: 0, fret: 3 }, { string: 0, fret: 0 },
    ]);
  });

  test('keeps the hand in one position rather than leaping about', () => {
    const midis = seq(['C4', 'D4', 'E4', 'F4', 'G4']).map((n) => n.midi);
    const frets = inferFingering(midis).map((p) => p.fret);
    assert.ok(Math.max(...frets) - Math.min(...frets) <= 5, `spread too wide: ${frets}`);
  });

  test('honours alternate tunings', () => {
    const [first] = inferFingering([nameToMidi('D2')], { tuning: DROP_D_TUNING });
    assert.deepEqual(first, { string: 0, fret: 0 });
  });

  test('never returns a negative or unreachable fret', () => {
    for (const midi of [20, 40, 64, 120]) {
      for (const pos of inferFingering([midi])) {
        assert.ok(pos.fret >= 0 && pos.fret <= 22, `bad fret ${pos.fret} for ${midi}`);
      }
    }
  });

  test('renders tab with the high E on top', () => {
    const tab = renderTab(inferFingering(seq(['E2', 'G2']).map((n) => n.midi)));
    const lines = tab.split('\n');
    assert.equal(lines.length, 6);
    assert.ok(lines[0]!.startsWith('E '));
    assert.ok(lines[5]!.includes('0'), 'low E string should carry the open E');
  });
});

describe('scale estimation', () => {
  test('hears the vision riff as E minor pentatonic', () => {
    const estimate = estimateScale(seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']));
    assert.equal(estimate.label, 'E minor pentatonic');
    assert.ok(estimate.confidence > 0.6);
  });

  test('hears a major scale as major', () => {
    const estimate = estimateScale(seq(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'G3', 'C3']));
    assert.equal(estimate.label, 'C major');
  });

  test('picks the blues scale when the flat five is used', () => {
    assert.equal(estimateScale(seq(['A2', 'C3', 'D3', 'D#3', 'E3', 'G3', 'A3', 'E3', 'A2'])).scale, 'blues');
  });

  test('admits when two notes are not enough to tell', () => {
    assert.ok(estimateScale(seq(['E2', 'G2'])).confidence <= 0.35);
  });

  test('says nothing at all about nothing', () => {
    const estimate = estimateScale([]);
    assert.equal(estimate.confidence, 0);
    assert.equal(estimate.scale, 'unknown');
  });

  test('offers alternatives, best first', () => {
    const alternatives = scaleAlternatives(seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']), 3);
    assert.equal(alternatives.length, 3);
    assert.equal(alternatives[0]!.label, 'E minor pentatonic');
    assert.ok(alternatives[0]!.confidence >= alternatives[1]!.confidence);
  });

  test('finds the home note the line keeps returning to', () => {
    assert.equal(pcToName(homePitchClass(seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']))), 'E');
  });

  test('tells a dark third from a bright one', () => {
    assert.equal(thirdQuality(seq(['E2', 'G2', 'B2']), pitchClass(nameToMidi('E2'))), 'minor');
    assert.equal(thirdQuality(seq(['E2', 'G#2', 'B2']), pitchClass(nameToMidi('E2'))), 'major');
    assert.equal(thirdQuality(seq(['E2', 'A2', 'B2']), pitchClass(nameToMidi('E2'))), 'ambiguous');
  });
});

describe('rhythm', () => {
  test('finds 120bpm in a run of eighth notes, not triplets at 80', () => {
    const notes = seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2', 'E2'], 250);
    const rhythm = estimateRhythm(notes);
    assert.ok(Math.abs(rhythm.bpm - 120) < 3, `got ${rhythm.bpm}`);
    assert.ok(rhythm.confidence > 0.8);
  });

  test('finds 90bpm in quarter notes', () => {
    const notes = seq(['E2', 'G2', 'A2', 'B2', 'G2'], 667);
    assert.ok(Math.abs(estimateRhythm(notes).bpm - 90) < 3);
  });

  test('rates a tight take steadier than a sloppy one', () => {
    const tight = seq(['E2', 'G2', 'A2', 'B2', 'G2'], 400);
    const sloppy = tight.map((n, i) => ({ ...n, startMs: [0, 250, 530, 700, 1040][i]! }));
    assert.ok(
      timingSteadiness(tight) > timingSteadiness(sloppy) + 0.05,
      `tight ${timingSteadiness(tight)} vs sloppy ${timingSteadiness(sloppy)}`,
    );
  });

  test('rhythm shape ignores tempo', () => {
    const slow = rhythmShape(seq(['E2', 'G2', 'A2', 'B2'], 800));
    const fast = rhythmShape(seq(['E2', 'G2', 'A2', 'B2'], 200));
    assert.equal(slow.length, fast.length);
    slow.forEach((v, i) => assert.ok(Math.abs(v - fast[i]!) < 0.05, `${slow} vs ${fast}`));
  });

  test('reports one take as faster than another', () => {
    assert.ok(tempoRatio(seq(['E2', 'G2', 'A2'], 400), seq(['E2', 'G2', 'A2'], 200)) > 1.8);
  });

  test('does not invent a tempo from one note', () => {
    assert.equal(estimateRhythm(seq(['E2'])).bpm, 0);
    assert.equal(estimateRhythm([]).bpm, 0);
  });
});
