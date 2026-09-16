import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { detectPitch, rmsOf } from '../src/audio/pitchDetect.ts';
import { NoteTracker } from '../src/audio/noteTracker.ts';
import { FrameStreamer } from '../src/audio/stream.ts';
import { timeStretch } from '../src/audio/timeStretch.ts';
import { frequencyToMidi, midiToFrequency, midiToName, nameToMidi } from '../src/music/notes.ts';
import { PLUCK_HARMONICS, pluck, synthesize } from './helpers.ts';

const SR = 44100;
const WINDOW = 2048;

function tone(hz: number, harmonics = PLUCK_HARMONICS, length = WINDOW, amplitude = 0.3): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let value = 0;
    for (let k = 0; k < harmonics.length; k++) {
      value += harmonics[k]! * Math.sin(2 * Math.PI * hz * (k + 1) * (i / SR));
    }
    out[i] = value * amplitude;
  }
  return out;
}

describe('pitch detection', () => {
  test('identifies every open string, and some fretted notes, exactly', () => {
    for (const name of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'G2', 'C4', 'F#3']) {
      const result = detectPitch(tone(midiToFrequency(nameToMidi(name))), { sampleRate: SR });
      assert.equal(midiToName(Math.round(frequencyToMidi(result.hz))), name);
      assert.ok(result.clarity > 0.9, `${name} clarity ${result.clarity}`);
    }
  });

  test('stays accurate to within five cents', () => {
    for (const name of ['E2', 'A2', 'D3', 'E4']) {
      const midi = nameToMidi(name);
      const { hz } = detectPitch(tone(midiToFrequency(midi)), { sampleRate: SR });
      assert.ok(Math.abs(frequencyToMidi(hz) - midi) * 100 < 5, `${name} off by too much`);
    }
  });

  test('does not drop an octave when the fundamental is weak', () => {
    // Second harmonic twice the fundamental: the classic octave-error trap.
    const weak = [0.15, 1.0, 0.8, 0.5];
    const { hz } = detectPitch(tone(midiToFrequency(nameToMidi('E2')), weak), { sampleRate: SR });
    assert.equal(midiToName(Math.round(frequencyToMidi(hz))), 'E2');
  });

  test('reports nothing for silence', () => {
    const result = detectPitch(new Float32Array(WINDOW), { sampleRate: SR });
    assert.equal(result.hz, 0);
    assert.equal(result.clarity, 0);
  });

  test('reports low clarity for noise rather than inventing a note', () => {
    const noise = new Float32Array(WINDOW);
    let state = 7;
    for (let i = 0; i < noise.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = ((state / 0x7fffffff) - 0.5) * 0.6;
    }
    assert.ok(detectPitch(noise, { sampleRate: SR }).clarity < 0.9);
  });

  test('treats quiet input as silence', () => {
    const quiet = tone(midiToFrequency(nameToMidi('E2')), PLUCK_HARMONICS, WINDOW, 0.0005);
    assert.equal(detectPitch(quiet, { sampleRate: SR }).hz, 0);
  });

  test('measures level', () => {
    assert.equal(rmsOf(new Float32Array(64)), 0);
    assert.ok(Math.abs(rmsOf(new Float32Array(64).fill(0.5)) - 0.5) < 1e-6);
  });
});

describe('note tracking', () => {
  /** Drive the tracker with synthetic frames at a fixed hop. */
  function run(frames: Array<{ midi: number | null; frames: number }>, hopMs = 11.6) {
    const tracker = new NoteTracker();
    const out = [];
    let t = 0;
    for (const step of frames) {
      for (let i = 0; i < step.frames; i++) {
        out.push(...tracker.process(
          step.midi === null
            ? { timeMs: t, hz: 0, clarity: 0, rms: 0 }
            : { timeMs: t, hz: midiToFrequency(step.midi), clarity: 0.95, rms: 0.2 },
        ));
        t += hopMs;
      }
    }
    out.push(...tracker.flush(t));
    return out;
  }

  test('emits one note per sustained pitch', () => {
    const notes = run([
      { midi: 40, frames: 30 }, { midi: null, frames: 20 },
      { midi: 43, frames: 30 }, { midi: null, frames: 20 },
    ]);
    assert.deepEqual(notes.map((n) => n.midi), [40, 43]);
  });

  test('ignores a single bad frame in the middle of a held note', () => {
    const notes = run([
      { midi: 40, frames: 15 }, { midi: 52, frames: 1 }, { midi: 40, frames: 15 },
      { midi: null, frames: 20 },
    ]);
    assert.deepEqual(notes.map((n) => n.midi), [40]);
  });

  test('discards a note too short to have been intentional', () => {
    assert.deepEqual(run([{ midi: 40, frames: 2 }, { midi: null, frames: 20 }]), []);
  });

  test('records duration and confidence', () => {
    const [note] = run([{ midi: 45, frames: 30 }, { midi: null, frames: 20 }]);
    assert.ok(note);
    assert.ok(note.durationMs > 250 && note.durationMs < 400, `duration ${note.durationMs}`);
    assert.ok(note.confidence > 0.9);
  });

  test('closes an open note when flushed', () => {
    const tracker = new NoteTracker();
    for (let i = 0; i < 30; i++) {
      tracker.process({ timeMs: i * 11.6, hz: midiToFrequency(40), clarity: 0.95, rms: 0.2 });
    }
    assert.equal(tracker.flush().length, 1);
    assert.equal(tracker.flush().length, 0, 'flushing twice must not duplicate');
  });
});

describe('end-to-end: audio in, notes out', () => {
  test('recovers the riff from synthesised audio', () => {
    const names = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
    const audio = synthesize(pluck(names));
    const streamer = new FrameStreamer({ sampleRate: SR });
    const tracker = new NoteTracker();
    const notes = [];
    // Deliberately ragged block sizes: hosts do not hand over neat windows.
    for (let offset = 0; offset < audio.length; offset += 333) {
      const chunk = audio.subarray(offset, Math.min(offset + 333, audio.length));
      for (const frame of streamer.push(chunk)) notes.push(...tracker.process(frame));
    }
    notes.push(...tracker.flush());

    assert.deepEqual(notes.map((n) => midiToName(n.midi)), names);
    // Notes were synthesised 300ms apart; onsets should land near that.
    for (let i = 1; i < notes.length; i++) {
      const gap = notes[i]!.startMs - notes[i - 1]!.startMs;
      assert.ok(Math.abs(gap - 300) < 60, `gap ${gap} between notes ${i - 1} and ${i}`);
    }
  });

  test('frame timestamps advance with the audio, not with block size', () => {
    const streamer = new FrameStreamer({ sampleRate: SR });
    streamer.push(new Float32Array(SR)); // exactly one second
    assert.ok(Math.abs(streamer.currentTimeMs - 1000) < 1e-9, `got ${streamer.currentTimeMs}`);
    // Feeding the same audio in ragged blocks must land on the same time.
    const ragged = new FrameStreamer({ sampleRate: SR });
    for (let offset = 0; offset < SR; offset += 333) {
      ragged.push(new Float32Array(Math.min(333, SR - offset)));
    }
    assert.ok(Math.abs(ragged.currentTimeMs - 1000) < 1e-9, `got ${ragged.currentTimeMs}`);
  });
});

describe('slowing audio down without moving the pitch', () => {
  /** A steady tone, long enough that stretching has something to work with. */
  function steadyTone(name: string, seconds = 1): Float32Array {
    const length = Math.floor(SR * seconds);
    const hz = midiToFrequency(nameToMidi(name));
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      let value = 0;
      for (let k = 0; k < PLUCK_HARMONICS.length; k++) {
        value += PLUCK_HARMONICS[k]! * Math.sin(2 * Math.PI * hz * (k + 1) * (i / SR));
      }
      out[i] = value * 0.3;
    }
    return out;
  }

  test('half speed takes about twice as long', () => {
    const stretched = timeStretch(steadyTone('A2'), 2);
    const ratio = stretched.length / (SR * 1);
    assert.ok(Math.abs(ratio - 2) < 0.1, `expected about 2x, got ${ratio.toFixed(2)}x`);
  });

  test('the note is still the same note afterwards', () => {
    for (const name of ['E2', 'A2', 'D3', 'G3']) {
      for (const factor of [2, 1.5, 0.75]) {
        const stretched = timeStretch(steadyTone(name), factor);
        // Analyse the middle, away from the windowed edges.
        const middle = stretched.subarray(Math.floor(stretched.length / 2), Math.floor(stretched.length / 2) + WINDOW);
        const { hz } = detectPitch(middle, { sampleRate: SR });
        const cents = Math.abs(frequencyToMidi(hz) - nameToMidi(name)) * 100;
        assert.ok(cents < 25, `${name} at ${factor}x drifted ${cents.toFixed(0)} cents`);
      }
    }
  });

  test('speeding up shortens it and still keeps the pitch', () => {
    const stretched = timeStretch(steadyTone('A2'), 0.5);
    assert.ok(Math.abs(stretched.length / (SR * 0.5) - 1) < 0.15);
    const middle = stretched.subarray(Math.floor(stretched.length / 2), Math.floor(stretched.length / 2) + WINDOW);
    assert.equal(midiToName(Math.round(frequencyToMidi(detectPitch(middle, { sampleRate: SR }).hz))), 'A2');
  });

  test('does not introduce clicks or blow up the level', () => {
    const source = steadyTone('A2');
    const stretched = timeStretch(source, 2);
    const peakIn = Math.max(...Array.from(source).map(Math.abs));
    const peakOut = Math.max(...Array.from(stretched).map(Math.abs));
    assert.ok(peakOut <= peakIn * 1.35, `peak grew from ${peakIn.toFixed(2)} to ${peakOut.toFixed(2)}`);
    // A click shows up as a big jump between neighbouring samples.
    let biggestJump = 0;
    for (let i = 1; i < stretched.length; i++) {
      biggestJump = Math.max(biggestJump, Math.abs(stretched[i]! - stretched[i - 1]!));
    }
    assert.ok(biggestJump < peakIn * 0.6, `sample-to-sample jump of ${biggestJump.toFixed(3)} suggests a click`);
  });

  test('a factor of one gives the audio back unchanged', () => {
    const source = steadyTone('A2', 0.2);
    assert.deepEqual(Array.from(timeStretch(source, 1)), Array.from(source));
  });

  test('refuses a nonsensical factor and copes with a tiny clip', () => {
    assert.throws(() => timeStretch(new Float32Array(4096), 0));
    assert.throws(() => timeStretch(new Float32Array(4096), -1));
    assert.equal(timeStretch(new Float32Array(64), 2).length, 64, 'too short to stretch is returned as-is');
  });
});
