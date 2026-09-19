import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteEvent } from '../src/types.ts';
import { motifBranches } from '../src/create/songwriting.ts';

function phrase(): NoteEvent[] {
  return [52, 55, 57, 59, 57, 55, 52].map((midi, index) => ({
    midi,
    startMs: index * 480,
    durationMs: 340,
    confidence: .95,
    velocity: .55,
  }));
}

describe('songwriting branches', () => {
  test('change one dimension rather than replacing the phrase', () => {
    const original = phrase();
    const branches = motifBranches(original);
    assert.deepEqual(branches.map((branch) => branch.kind), ['rhythm', 'space', 'register']);

    const rhythm = branches.find((branch) => branch.kind === 'rhythm')!;
    assert.deepEqual(rhythm.notes.map((note) => note.midi), original.map((note) => note.midi));
    assert.notDeepEqual(rhythm.notes.map((note) => note.startMs), original.map((note) => note.startMs));

    const space = branches.find((branch) => branch.kind === 'space')!;
    assert.equal(space.notes.length, original.length - 1);

    const register = branches.find((branch) => branch.kind === 'register')!;
    assert.deepEqual(
      register.notes.slice(0, Math.floor(original.length / 2)).map((note) => note.midi),
      original.slice(0, Math.floor(original.length / 2)).map((note) => note.midi),
    );
    assert.ok(register.notes.every((note) => note.midi <= 88));
  });

  test('branches remain playable events in time order', () => {
    for (const branch of motifBranches(phrase())) {
      for (let i = 1; i < branch.notes.length; i++) {
        assert.ok(branch.notes[i]!.startMs > branch.notes[i - 1]!.startMs);
      }
      assert.ok(branch.notes.every((note) => note.durationMs > 0));
      assert.ok(branch.principle.length > 30);
    }
  });
});
