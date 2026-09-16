import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { align } from '../src/phrase/align.ts';
import { restThreshold, restsBetween, segmentPhrases } from '../src/phrase/segment.ts';
import { compareNotes, contourSimilarity, intervalSimilarity, rhythmSimilarity } from '../src/phrase/similarity.ts';
import { diffTakes, renderDiff } from '../src/phrase/diff.ts';
import { groupMotifs, repeatedMotifs, sameIdea } from '../src/phrase/motif.ts';
import { cleanestIndex, takeQuality } from '../src/phrase/quality.ts';
import { combineTakes, dropTail, rebase, replaceTail, timeScale, transpose, typicalStepMs } from '../src/phrase/edit.ts';
import { analyzeNotes } from '../src/phrase/analyze.ts';
import { midiToName } from '../src/music/notes.ts';
import { seq, seqAt } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi));

describe('alignment', () => {
  const numeric = { substitutionCost: (a: number, b: number) => Math.min(1, Math.abs(a - b) / 4) };

  test('identical sequences align perfectly', () => {
    const result = align([1, 2, 3], [1, 2, 3], numeric);
    assert.equal(result.distance, 0);
    assert.equal(result.similarity, 1);
    assert.ok(result.ops.every((op) => op.kind === 'match'));
  });

  test('handles empty input on either side', () => {
    assert.equal(align([], [], numeric).similarity, 1);
    assert.equal(align([1, 2], [], numeric).ops.length, 2);
    assert.equal(align([], [1, 2], numeric).ops.filter((o) => o.kind === 'insert').length, 2);
  });

  test('every op accounts for one element of each sequence it touches', () => {
    const result = align([1, 2, 3, 9], [1, 5, 3], numeric);
    const aTouched = result.ops.filter((o) => o.aIndex !== null).length;
    const bTouched = result.ops.filter((o) => o.bIndex !== null).length;
    assert.equal(aTouched, 4);
    assert.equal(bTouched, 3);
  });
});

describe('segmentation', () => {
  test('splits on breaths, not on every gap', () => {
    const notes = [
      ...seqAt(RIFF, 0, 300),
      ...seqAt(['C3', 'D3', 'E3', 'G3'], 3200, 300),
      ...seqAt(['A2', 'C3', 'D3', 'A2'], 6000, 300),
    ];
    const phrases = segmentPhrases(notes);
    assert.equal(phrases.length, 3);
    assert.deepEqual(names(phrases[0]!.notes), RIFF);
    assert.deepEqual(names(phrases[2]!.notes), ['A2', 'C3', 'D3', 'A2']);
  });

  test('does not offer a stray note or two as a musical idea', () => {
    const notes = [...seqAt(RIFF, 0, 300), ...seqAt(['C3'], 4000, 300)];
    const phrases = segmentPhrases(notes);
    assert.equal(phrases.length, 1);
  });

  test('adapts the breath threshold to how fast the player is playing', () => {
    // Rests must scale with tempo for this to mean anything, so build the
    // takes with proportional gaps rather than the fixed gap `seq` uses.
    const atTempo = (stepMs: number) => seq(RIFF, stepMs).map((n, i) => ({
      ...n, startMs: i * stepMs, durationMs: stepMs * 0.6,
    }));
    const fast = restThreshold(atTempo(150));
    const slow = restThreshold(atTempo(1200));
    assert.ok(slow > fast, `slow ${slow} should exceed fast ${fast}`);
  });

  test('forces a boundary rather than letting one phrase run forever', () => {
    const long = seq(new Array(80).fill('E2'), 120);
    for (const phrase of segmentPhrases(long)) assert.ok(phrase.notes.length <= 32);
  });

  test('handles no notes and unsorted notes', () => {
    assert.deepEqual(segmentPhrases([]), []);
    const shuffled = [...seq(RIFF, 300)].reverse();
    assert.deepEqual(names(segmentPhrases(shuffled)[0]!.notes), RIFF);
  });

  test('measures the silence between notes, never below zero', () => {
    for (const rest of restsBetween(seq(RIFF, 300))) assert.ok(rest >= 0);
  });

  test('still splits when the notes inside a phrase run together', () => {
    // Legato playing: no gap at all between notes, long pauses between ideas.
    const legato = (startMs: number, count: number) =>
      new Array(count).fill(0).map((_, i) => ({
        midi: 40 + (i % 5) * 2, startMs: startMs + i * 260, durationMs: 260, confidence: 0.95,
      }));
    const phrases = segmentPhrases([
      ...legato(0, 6), ...legato(2900, 4), ...legato(5600, 6),
    ]);
    assert.equal(phrases.length, 3, 'zero-length gaps must not swallow the breaths');
  });
});

describe('similarity', () => {
  test('a take matches itself', () => {
    assert.equal(compareNotes(seq(RIFF), seq(RIFF)).overall, 1);
  });

  test('the same idea in a different key is still the same idea', () => {
    const transposed = transpose(seq(RIFF), 3);
    assert.ok(intervalSimilarity(seq(RIFF), transposed) === 1);
    assert.ok(compareNotes(seq(RIFF), transposed).overall > 0.95);
    // ...but it knows the key moved.
    assert.ok(compareNotes(seq(RIFF), transposed).pitchLevel < 1);
  });

  test('the same idea at a different tempo is still the same idea', () => {
    assert.ok(compareNotes(seq(RIFF, 400), seq(RIFF, 200)).overall > 0.95);
  });

  test('a one-note variation scores high but not perfect', () => {
    const score = compareNotes(seq(RIFF), seq(['E2', 'G2', 'A2', 'C3', 'B2', 'G2'])).overall;
    assert.ok(score > 0.75 && score < 0.98, `got ${score}`);
  });

  test('an unrelated phrase scores well below the grouping threshold', () => {
    const score = compareNotes(seq(RIFF), seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2'])).overall;
    assert.ok(score < 0.7, `got ${score}`);
  });

  test('component scores stay inside 0..1', () => {
    const pairs: [string[], string[]][] = [
      [RIFF, ['E2']], [['E2'], RIFF], [RIFF, RIFF], [['A2', 'B2'], ['G2', 'F2', 'E2']],
    ];
    for (const [a, b] of pairs) {
      const r = compareNotes(seq(a), seq(b));
      for (const v of [r.overall, r.interval, r.rhythm, r.contour, r.pitchLevel]) {
        assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
      }
    }
  });

  test('contour and rhythm can be compared on their own', () => {
    assert.equal(contourSimilarity(seq(['E2', 'G2', 'A2']), seq(['C3', 'D3', 'F3'])), 1);
    assert.ok(rhythmSimilarity(seq(RIFF, 400), seq(RIFF, 400)) === 1);
  });
});

describe('diffing takes', () => {
  test('spots a note added in the middle', () => {
    const diff = diffTakes(seq(['E2', 'G2', 'A2', 'B2', 'G2']), seq(['E2', 'G2', 'A2', 'C3', 'B2']));
    const added = diff.changes.filter((c) => c.kind === 'added');
    assert.equal(added.length, 1);
    assert.equal(added[0]!.toNote, 'C3');
  });

  test('spots a single changed note as a change, not an add and a drop', () => {
    const diff = diffTakes(seq(['E2', 'G2', 'A2']), seq(['E2', 'G#2', 'A2']));
    const changed = diff.changes.filter((c) => c.kind === 'changed');
    assert.equal(changed.length, 1);
    assert.equal(changed[0]!.fromNote, 'G2');
    assert.equal(changed[0]!.toNote, 'G#2');
  });

  test('knows when nothing changed', () => {
    const diff = diffTakes(seq(RIFF), seq(RIFF));
    assert.ok(diff.identical);
    assert.equal(diff.keptCount, RIFF.length);
    assert.match(diff.summary, /same notes/i);
  });

  test('reports a tempo change in plain language', () => {
    const diff = diffTakes(seq(RIFF, 400), seq(RIFF, 300));
    assert.ok(diff.tempoRatio > 1.2);
    assert.match(diff.summary, /faster/);
  });

  test('summary reads as one sentence, not two run together', () => {
    const summary = diffTakes(seq(RIFF, 400), seq(RIFF, 300)).summary;
    assert.ok(!summary.includes('., '), `double punctuation in: ${summary}`);
    assert.ok(summary.endsWith('.'));
  });

  test('renders both takes lined up against each other', () => {
    const rendered = renderDiff(seq(['E2', 'G2', 'A2', 'B2', 'G2']), seq(['E2', 'G2', 'A2', 'C3', 'B2']));
    const lines = rendered.split('\n');
    assert.match(lines[0]!, /^Take A:/);
    assert.match(lines[1]!, /^Take B:/);
    assert.ok(lines[0]!.includes('·') || lines[1]!.includes('·'), 'a gap should be marked');
  });
});

describe('take quality', () => {
  test('rates a clean take above a scrappy one', () => {
    const clean = seq(RIFF, 400, 0.98);
    const scrappy = seq(RIFF, 400, 0.4).map((n, i) => ({
      ...n, startMs: [0, 260, 540, 690, 1100, 1250][i]!, durationMs: i === 2 ? 30 : n.durationMs,
    }));
    assert.ok(takeQuality(clean).score > takeQuality(scrappy).score + 0.15);
  });

  test('picks the cleanest of several takes', () => {
    const takes = [seq(RIFF, 400, 0.6), seq(RIFF, 400, 0.7), seq(RIFF, 400, 0.99)];
    assert.equal(cleanestIndex(takes), 2);
  });

  test('says nothing rather than something about an empty take', () => {
    assert.equal(takeQuality([]).score, 0);
  });
});

describe('motifs', () => {
  test('groups a riff with its variations and its repeats', () => {
    const phrases = segmentPhrases([
      ...seqAt(RIFF, 0, 300),
      ...seqAt(['C3', 'D3', 'E3', 'G3'], 3200, 300),
      ...seqAt(['E2', 'G2', 'A2', 'C3', 'B2', 'G2'], 6000, 300),
      ...seqAt(RIFF, 9300, 300, 0.99),
      ...seqAt(['A2', 'A2', 'D3', 'F3', 'A3', 'F3'], 12600, 280),
    ]);
    const groups = groupMotifs(phrases);
    assert.equal(groups[0]!.takes.length, 3, 'the riff and its two revisits');
    assert.ok(groups[0]!.cohesion > 0.85);
    // The last take was played most confidently, so it is the keeper.
    assert.equal(groups[0]!.cleanest.startMs, 9300);
  });

  test('reports only the ideas actually returned to', () => {
    const phrases = segmentPhrases([
      ...seqAt(RIFF, 0, 300),
      ...seqAt(['C3', 'D3', 'E3', 'G3'], 3200, 300),
      ...seqAt(RIFF, 6000, 300),
    ]);
    const repeated = repeatedMotifs(phrases);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0]!.takes.length, 2);
  });

  test('does not glue unrelated ideas together', () => {
    const phrases = segmentPhrases([
      ...seqAt(RIFF, 0, 300),
      ...seqAt(['C3', 'C3', 'F3', 'A3', 'D3', 'F2'], 3200, 300),
    ]);
    assert.equal(groupMotifs(phrases).length, 2);
  });

  test('answers the plain question directly', () => {
    assert.ok(sameIdea(seq(RIFF), transpose(seq(RIFF), 5)));
    assert.ok(!sameIdea(seq(RIFF), seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2'])));
  });
});

describe('edits', () => {
  test('transposing moves every note and nothing else', () => {
    const original = seq(RIFF);
    const moved = transpose(original, 3);
    moved.forEach((n, i) => {
      assert.equal(n.midi, original[i]!.midi + 3);
      assert.equal(n.startMs, original[i]!.startMs);
    });
    assert.deepEqual(names(original), RIFF, 'the original must be untouched');
  });

  test('slowing down stretches time and leaves pitch alone', () => {
    const original = seq(RIFF, 400);
    const slow = timeScale(original, 2);
    assert.deepEqual(slow.map((n) => n.midi), original.map((n) => n.midi));
    assert.equal(slow[1]!.startMs - slow[0]!.startMs, 800);
  });

  test('rebasing moves a take without changing its shape', () => {
    const moved = rebase(seq(RIFF, 400), 5000);
    assert.equal(moved[0]!.startMs, 5000);
    assert.equal(moved[1]!.startMs - moved[0]!.startMs, 400);
  });

  test('dropping and replacing a tail', () => {
    assert.deepEqual(names(dropTail(seq(RIFF), 3)), ['E2', 'G2', 'A2']);
    const replaced = replaceTail(seq(RIFF), 3, seq(['C3', 'D3']));
    assert.deepEqual(names(replaced), ['E2', 'G2', 'A2', 'C3', 'D3']);
    // The replacement must follow on in time, not overlap the head.
    assert.ok(replaced[3]!.startMs > replaced[2]!.startMs);
  });

  test('combining takes the opening of one and the ending of the other', () => {
    const combined = combineTakes(seq(RIFF), seq(['E2', 'G2', 'A2', 'C3', 'B2', 'G2']));
    assert.deepEqual(names(combined), ['E2', 'G2', 'A2', 'C3', 'B2', 'G2']);
    assert.ok(combined.every((n, i) => i === 0 || n.startMs > combined[i - 1]!.startMs));
  });

  test('finds the typical gap between notes', () => {
    assert.ok(Math.abs(typicalStepMs(seq(RIFF, 400)) - 400) < 1);
  });
});

describe('analysis', () => {
  test('reads one idea completely', () => {
    const analysis = analyzeNotes(seq(RIFF, 380));
    assert.deepEqual(analysis.noteNames, RIFF);
    assert.deepEqual(analysis.intervals, [3, 2, 2, -4, -3]);
    assert.equal(analysis.scale.label, 'E minor pentatonic');
    assert.equal(analysis.resolution, 'down');
    assert.equal(analysis.positions.length, RIFF.length);
    assert.equal(analysis.tab.split('\n').length, 6);
    assert.ok(analysis.rhythm.bpm > 0);
  });

  test('survives a single note without inventing anything', () => {
    const analysis = analyzeNotes(seq(['E2']));
    assert.deepEqual(analysis.intervals, []);
    assert.equal(analysis.resolution, 'static');
  });
});
