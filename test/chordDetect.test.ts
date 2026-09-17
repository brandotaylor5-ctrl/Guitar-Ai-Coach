import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectChord } from '../web/audio/chordDetect.ts';
import { GUITAR_VOICINGS, strumSpectrum } from './helpers.ts';

const SR = 44100;
const FFT = 8192;

/** The detector spells sharps with ♯; tests read better in ASCII. */
function detect(midis: number[], options = {}): string | null {
  const chord = detectChord(strumSpectrum(midis, options), SR, FFT);
  return chord ? chord.label.replace('♯', '#') : null;
}

/**
 * An idealised spectrum: one clean impulse per partial, at exact bin centres,
 * with no window spread and no noise. Useful as a floor, but nothing that
 * passes only this has been shown to work on a guitar — which is why every
 * test below it uses `strumSpectrum` instead.
 */
function idealSpectrum(notes: number[]): Float32Array {
  const out = new Float32Array(FFT / 2).fill(-120);
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  for (const midi of notes) {
    const f = hz(midi);
    for (const [harmonic, db] of [[1, -28], [2, -35], [3, -42], [4, -49]] as const) {
      const bin = Math.round((f * harmonic) * FFT / SR);
      if (bin > 0 && bin < out.length) out[bin] = Math.max(out[bin]!, db);
    }
  }
  return out;
}

describe('chord recognition, on idealised input', () => {
  test('recognises a clean E minor guitar voicing', () => {
    const chord = detectChord(idealSpectrum([40, 47, 52, 55, 59, 64]), SR, FFT);
    assert.ok(chord);
    assert.equal(chord.rootPc, 4);
    assert.match(chord.label, /^Em/);
  });

  test('does not invent a chord from one note', () => {
    assert.equal(detectChord(idealSpectrum([40]), SR, FFT), null);
  });
});

describe('chord recognition, on realistic playing', () => {
  test('recognises the open chords a beginner actually plays', () => {
    const expected = ['E', 'Em', 'E5', 'A', 'Am', 'C', 'D', 'Dm', 'G'];
    const wrong: string[] = [];
    for (const name of expected) {
      const got = detect(GUITAR_VOICINGS[name]!);
      if (got !== name) wrong.push(`${name} → ${got ?? 'nothing'}`);
    }
    assert.deepEqual(wrong, [], 'these came back wrong');
  });

  test('the bass note decides the chord', () => {
    // The failure this guards: an open E is mostly doubled E and B, so a
    // template of just those two notes used to outscore E major and the
    // detector confidently reported Bsus4.
    assert.equal(detect(GUITAR_VOICINGS.E!), 'E');
    assert.equal(detect(GUITAR_VOICINGS.Am!), 'Am');
    assert.equal(detect(GUITAR_VOICINGS.E5!), 'E5');
  });

  test('tells major from minor, which is the distinction that matters', () => {
    assert.equal(detect(GUITAR_VOICINGS.E!), 'E');
    assert.equal(detect(GUITAR_VOICINGS.Em!), 'Em');
    assert.equal(detect(GUITAR_VOICINGS.A!), 'A');
    assert.equal(detect(GUITAR_VOICINGS.Am!), 'Am');
    assert.equal(detect(GUITAR_VOICINGS.D!), 'D');
    assert.equal(detect(GUITAR_VOICINGS.Dm!), 'Dm');
  });

  test('survives a noisy room and a guitar that is out of tune', () => {
    for (const name of ['Em', 'A', 'C', 'G', 'D']) {
      assert.equal(detect(GUITAR_VOICINGS[name]!, { noise: 0.02 }), name, `${name} in noise`);
      assert.equal(detect(GUITAR_VOICINGS[name]!, { detuneCents: 14 }), name, `${name} out of tune`);
    }
  });

  test('copes with a chord struck all at once', () => {
    for (const name of ['E', 'Em', 'A', 'Am', 'C', 'G']) {
      assert.equal(detect(GUITAR_VOICINGS[name]!, { spreadMs: 2 }), name);
    }
  });
});

describe('chord recognition knows when to say nothing', () => {
  test('one note is not a chord, however loudly it rings', () => {
    // A plucked string's twelfth is a perfect fifth and its fifteenth a major
    // second, so an unguarded detector reports a confident E5 or Esus2 from a
    // single open E — and a player picking out a melody watches phantom chords
    // scroll past.
    for (const midi of [40, 45, 50, 55]) {
      assert.equal(detect([midi]), null, `midi ${midi} alone`);
    }
  });

  test('silence is silence', () => {
    assert.equal(detectChord(new Float32Array(FFT / 2).fill(-120), SR, FFT), null);
  });

  test('broadband noise is not a chord', () => {
    const noise = new Float32Array(FFT / 2);
    let state = 7;
    for (let i = 0; i < noise.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = -40 + (state / 0x7fffffff) * 20;
    }
    assert.equal(detectChord(noise, SR, FFT), null);
  });
});

describe('the edges of what it can do', () => {
  // These are recorded rather than wished away. A detector whose limits are
  // written down can be trusted at the edges; one whose tests only cover what
  // it happens to do well cannot.

  test('a seventh is reported as its triad', () => {
    // Right root, right quality, extension dropped. The seventh is one quiet
    // string among five and does not survive the harmonic clutter.
    assert.equal(detect(GUITAR_VOICINGS.A7!), 'A');
  });

  test('a slow strum reads as a power chord until the strum finishes', () => {
    // The analysis window is about 190ms. Forty milliseconds between six
    // strings means the thirds have barely sounded yet, so root-and-fifth is
    // an honest reading of what has arrived. `ChordTracker` waits for three
    // agreeing frames, so the full chord wins once the strum completes.
    assert.equal(detect(GUITAR_VOICINGS.E!, { spreadMs: 40 }), 'E5');
  });

  test('barre chords find the root but can mislabel the quality', () => {
    // An E-shape F barre lands on F, but a partial from one of the inner
    // strings is enough to tip it into Fmaj7. The root is dependable here;
    // the suffix is not, and B minor is missed outright. Open shapes are
    // what this is good at, and that is most of what a beginner plays.
    const f = detect([41, 48, 53, 57, 60, 65]);
    assert.ok(f?.startsWith('F'), `expected an F-rooted chord, got ${f}`);
  });
});
