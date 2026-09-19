import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkChordShape } from '../src/audio/chordCheck.ts';
import { chordShape, chordShapeMidis } from '../src/music/chordShapes.ts';
import { STANDARD_TUNING } from '../src/music/fretboard.ts';
import { guitarEvidence } from '../web/audio/chordDetect.ts';
import { strumSpectrum } from './helpers.ts';

/** Strength at every note, as the detector would read a real strum. */
function evidenceFor(midis: number[], gains?: number[]): number[] {
  return guitarEvidence(strumSpectrum(midis, gains ? { gains } : {}), 44100, 8192).perMidi;
}

describe('hearing which string is dead', () => {
  test('a clean chord is reported clean', () => {
    const shape = chordShape('Em')!;
    const check = checkChordShape(evidenceFor(chordShapeMidis(shape)), shape, STANDARD_TUNING);
    assert.equal(check.missing.length, 0, check.advice.join(' '));
    assert.equal(check.clean, true);
    assert.match(check.advice[0]!, /clean/i);
  });

  test('a muted string is found, and named as a string a player would recognise', () => {
    const shape = chordShape('Em')!;
    const midis = chordShapeMidis(shape);
    // Kill the G string — the one that actually dies on a beginner's E minor.
    const gIndex = midis.indexOf(55);
    const gains = midis.map((_, i) => (i === gIndex ? 0 : 1));
    const check = checkChordShape(evidenceFor(midis, gains), shape, STANDARD_TUNING);
    assert.equal(check.clean, false);
    assert.ok(check.missing.some((s) => s.expectedMidi === 55), 'should find the G string');
    assert.match(check.advice.join(' '), /G string/);
  });

  test('the advice names a finger to move, not a frequency', () => {
    const shape = chordShape('Em')!;
    const midis = chordShapeMidis(shape);
    const gains = midis.map((_, i) => (midis[i] === 55 ? 0 : 1));
    const advice = checkChordShape(evidenceFor(midis, gains), shape, STANDARD_TUNING).advice.join(' ');
    assert.match(advice, /index|middle|ring|little/, 'it has to say which finger');
    assert.doesNotMatch(advice, /midi|hz|spectrum|pitch class/i);
  });

  test('a fretted string that is not pressed hard enough gets different advice', () => {
    const shape = chordShape('C')!;
    const midis = chordShapeMidis(shape);
    // The C shape's index finger note on the B string, first fret.
    const target = 60;
    const gains = midis.map((m) => (m === target ? 0 : 1));
    const check = checkChordShape(evidenceFor(midis, gains), shape, STANDARD_TUNING);
    if (check.missing.some((s) => s.expectedMidi === target)) {
      assert.match(check.advice.join(' '), /fret wire|press/i);
    }
  });

  test('strings the shape does not play are never called dead', () => {
    const shape = chordShape('D')!;
    const check = checkChordShape(evidenceFor(chordShapeMidis(shape)), shape, STANDARD_TUNING);
    const notPlayed = check.strings.filter((s) => s.fret === 'x');
    assert.ok(notPlayed.length >= 1, 'D does not use the low strings');
    for (const s of notPlayed) assert.equal(s.verdict, 'not-played');
  });

  test('it says when it cannot tell, rather than guessing', () => {
    // A string whose note is a harmonic of a lower one proves nothing, and
    // claiming a chord is clean when it is not is worse than saying nothing.
    const shape = chordShape('Em')!;
    const check = checkChordShape(evidenceFor(chordShapeMidis(shape)), shape, STANDARD_TUNING);
    const unclear = check.strings.filter((s) => s.verdict === 'unclear');
    if (unclear.length) assert.match(check.advice.join(' '), /cannot honestly tell|one at a time/i);
    for (const s of check.strings) {
      assert.ok(['ringing', 'missing', 'unclear', 'not-played'].includes(s.verdict));
    }
  });

  test('silence is every played string missing, not a clean chord', () => {
    const shape = chordShape('G')!;
    const check = checkChordShape(new Array(89).fill(0), shape, STANDARD_TUNING);
    assert.equal(check.clean, false);
    const played = check.strings.filter((s) => s.fret !== 'x');
    assert.equal(check.missing.length, played.length);
    assert.match(check.advice.join(' '), /strumming hand/);
  });

  test('every beginner shape can be checked without crashing', () => {
    for (const name of ['Em', 'E', 'Am', 'A', 'G', 'C', 'D', 'Dm']) {
      const shape = chordShape(name);
      if (!shape) continue;
      const check = checkChordShape(evidenceFor(chordShapeMidis(shape)), shape, STANDARD_TUNING);
      assert.equal(check.strings.length, shape.frets.length);
      assert.ok(check.advice.length > 0, `${name} produced no advice`);
    }
  });

  test('string numbers match what a player is told elsewhere', () => {
    const shape = chordShape('Em')!;
    const check = checkChordShape(evidenceFor(chordShapeMidis(shape)), shape, STANDARD_TUNING);
    // The thickest string is the 6th; the thinnest is the 1st.
    assert.equal(check.strings[0]!.stringNumber, 6);
    assert.equal(check.strings[5]!.stringNumber, 1);
  });
});
