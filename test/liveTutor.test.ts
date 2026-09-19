import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteEvent, PhraseAnalysis } from '../src/types.ts';
import {
  compactChordLabel, inferHarmonyCenter, nextPlayableChord, readMelody, readTime, readTouch,
} from '../src/coach/liveTutor.ts';
import { analyzeNotes } from '../src/phrase/analyze.ts';

function notes(midis: number[], gap = 500, velocity = 0.5): NoteEvent[] {
  return midis.map((midi, i) => ({
    midi,
    startMs: i * gap,
    durationMs: Math.max(120, gap * 0.7),
    confidence: 0.95,
    velocity: velocity + (i % 2 ? 0.04 : -0.04),
  }));
}

describe('Live Coach musical reads', () => {
  test('turns theory chord labels into guitar symbols', () => {
    assert.equal(compactChordLabel('C major'), 'C');
    assert.equal(compactChordLabel('A minor'), 'Am');
    assert.equal(compactChordLabel('F♯ minor'), 'F#m');
  });

  test('a simple rising line becomes beginner-readable melody feedback', () => {
    const analysis = analyzeNotes(notes([52, 54, 55, 57, 59]));
    const read = readMelody(analysis);
    assert.match(read.headline, /stepwise|rising/i);
    assert.match(read.detail, /note/);
    assert.ok(read.next.length > 25);
  });

  test('tempo read reports a pulse only when evidence is strong enough', () => {
    const analysis = analyzeNotes(notes([52, 54, 55, 57, 59, 57], 500));
    const read = readTime(analysis);
    assert.ok(read.bpm !== null);
    assert.match(read.headline, /BPM/);
  });

  test('tempo read notices a meaningful speed change', () => {
    const slow = analyzeNotes(notes([52, 54, 55, 57, 59, 57], 600));
    const fast = analyzeNotes(notes([52, 54, 55, 57, 59, 57], 450));
    const read = readTime(fast, slow);
    assert.match(read.detail, /faster|slower/);
  });

  test('touch read can distinguish a deliberately shaped phrase', () => {
    const shaped = notes([52,54,55,57,59,60], 500).map((n, i) => ({ ...n, velocity: 0.15 + i * 0.12 }));
    const read = readTouch(shaped);
    assert.notEqual(read.headline, 'Touch still unclear');
    assert.match(read.detail, /harder|backed off|same level/);
  });
});

describe('Live Coach harmony guidance', () => {
  test('infers G major from G C D G with useful confidence', () => {
    const center = inferHarmonyCenter([
      { rootPc: 7, quality: 'major', label: 'G' },
      { rootPc: 0, quality: 'major', label: 'C' },
      { rootPc: 2, quality: 'major', label: 'D' },
      { rootPc: 7, quality: 'major', label: 'G' },
    ]);
    assert.ok(center);
    assert.equal(center!.rootPc, 7);
    assert.equal(center!.minor, false);
  });

  test('never suggests a chord whose physical shape is unavailable', () => {
    const center = { rootPc: 7, minor: false, confidence: 0.8 };
    const move = nextPlayableChord(
      center,
      { rootPc: 7, quality: 'major', label: 'G' },
      ['G', 'C'],
    );
    assert.ok(move);
    assert.equal(move!.label, 'C');
  });

  test('returns no fake advice when none of the candidate shapes can be taught', () => {
    const center = { rootPc: 6, minor: false, confidence: 0.8 };
    const move = nextPlayableChord(
      center,
      { rootPc: 6, quality: 'major', label: 'F#' },
      ['Em', 'Am', 'C'],
    );
    assert.equal(move, null);
  });
});
