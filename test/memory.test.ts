import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RollingMemory } from '../src/memory/rollingMemory.ts';
import { AudioRingBuffer } from '../src/memory/audioRing.ts';
import { midiToName } from '../src/music/notes.ts';
import { seqAt } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi));

describe('rolling pitch memory', () => {
  test('remembers what was played inside the window', () => {
    const memory = new RollingMemory({ windowMs: 30_000 });
    memory.pushAll(seqAt(RIFF, 1000, 300));
    assert.equal(memory.size, RIFF.length);
    assert.deepEqual(names(memory.all()), RIFF);
  });

  test('forgets what has aged out, without being asked', () => {
    const memory = new RollingMemory({ windowMs: 5_000 });
    memory.pushAll(seqAt(RIFF, 0, 300));
    memory.pushAll(seqAt(['C3', 'D3', 'E3'], 20_000, 300));
    assert.deepEqual(names(memory.all()), ['C3', 'D3', 'E3']);
  });

  test('keeps ageing during silence', () => {
    const memory = new RollingMemory({ windowMs: 5_000 });
    memory.pushAll(seqAt(RIFF, 0, 300));
    assert.equal(memory.size, RIFF.length);
    memory.tick(60_000);
    assert.equal(memory.size, 0, 'silence should not preserve the buffer forever');
  });

  test('rewinds a requested number of seconds', () => {
    const memory = new RollingMemory({ windowMs: 60_000 });
    memory.pushAll(seqAt(RIFF, 0, 300));
    memory.pushAll(seqAt(['C3', 'D3', 'E3'], 30_000, 300));
    assert.deepEqual(names(memory.lastMs(10_000)), ['C3', 'D3', 'E3']);
  });

  test('hands back the last complete idea, not the last few notes', () => {
    const memory = new RollingMemory({ windowMs: 60_000 });
    memory.pushAll(seqAt(RIFF, 0, 300));
    memory.pushAll(seqAt(['C3', 'D3', 'E3', 'G3'], 5_000, 300));
    assert.deepEqual(names(memory.lastPhrase()!.notes), ['C3', 'D3', 'E3', 'G3']);
  });

  test('has nothing to say before anything is played', () => {
    const memory = new RollingMemory();
    assert.equal(memory.lastPhrase(), null);
    assert.deepEqual(memory.recentPhrases(), []);
  });

  test('clearing really clears', () => {
    const memory = new RollingMemory();
    memory.pushAll(seqAt(RIFF, 0, 300));
    memory.clear();
    assert.equal(memory.size, 0);
    assert.equal(memory.lastPhrase(), null);
  });
});

describe('audio ring buffer', () => {
  const SR = 8000;

  function ramp(length: number, from = 0): Float32Array {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = from + i;
    return out;
  }

  test('keeps only as much audio as its window allows', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 1000 });
    assert.equal(ring.capacity, SR);
    ring.write(ramp(SR * 3));
    assert.equal(Math.round(ring.durationMs), 1000);
    assert.equal(Math.round(ring.currentTimeMs), 3000);
  });

  test('extracts a clip by absolute session time', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 10_000 });
    ring.write(ramp(SR * 2));
    const clip = ring.extract(500, 1500);
    assert.equal(clip.length, SR);
    assert.equal(clip[0], SR * 0.5);
    assert.equal(clip[clip.length - 1], SR * 1.5 - 1);
  });

  test('audio older than the window is genuinely gone', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 1000 });
    ring.write(ramp(SR * 3));
    assert.equal(ring.extract(0, 500).length, 0, 'must not resurrect overwritten audio');
    const recent = ring.extract(2500, 3000);
    assert.equal(recent.length, SR * 0.5);
    assert.equal(recent[0], SR * 2.5);
  });

  test('handles wrap-around without scrambling the clip', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 1000 });
    ring.write(ramp(Math.floor(SR * 1.5)));
    const clip = ring.extract(1000, 1500);
    for (let i = 0; i < clip.length; i++) assert.equal(clip[i], SR + i);
  });

  test('returns nothing for a backwards or future range', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 1000 });
    ring.write(ramp(SR));
    assert.equal(ring.extract(800, 200).length, 0);
    assert.equal(ring.extract(5000, 6000).length, 0);
  });

  test('clearing wipes the audio and resets the clock', () => {
    const ring = new AudioRingBuffer({ sampleRate: SR, windowMs: 1000 });
    ring.write(ramp(SR));
    ring.clear();
    assert.equal(ring.durationMs, 0);
    assert.equal(ring.currentTimeMs, 0);
    assert.equal(ring.extract(0, 1000).length, 0);
  });
});
