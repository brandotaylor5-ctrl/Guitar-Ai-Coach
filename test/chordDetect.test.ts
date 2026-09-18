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

  test('a missed low string does not rename the chord', () => {
    // The commonest thing that actually happens on a downstroke. Charging too
    // much for the root not being the lowest note renamed every chord to
    // whatever was left at the bottom: a strummed E came back as Bsus4.
    assert.equal(detect([47, 52, 56, 59, 64]), 'E', 'E without its low string');
    assert.equal(detect([47, 52, 55, 59, 64]), 'Em', 'Em without its low string');
    assert.equal(detect([52, 57, 60, 64]), 'Am', 'Am without its low string');
    assert.equal(detect([47, 50, 55, 59, 67]), 'G', 'G without its low string');
    assert.equal(detect([52, 55, 60, 64]), 'C', 'C without its bass note');
    assert.equal(detect([57, 62, 66]), 'D', 'D without its bass note');
  });

  test('the bass note guides the chord', () => {
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

describe('a quiet string is still a string', () => {
  // Reported from real playing: "I'm strumming an A or a D right, but it picks
  // up D5". The third is the note that tells a major chord from a power chord,
  // and on an A or D shape it is the one fretted note among open, doubled
  // strings — so it is always the quietest thing in the chord. Scoring by
  // loudness alone, root-and-fifth won every time.

  test('a D whose third is quiet is still a D', () => {
    for (const gain of [0.5, 0.4, 0.3]) {
      assert.equal(detect(GUITAR_VOICINGS.D!, { gains: [1, 1, 1, gain] }), 'D',
        `D with its F# at ${gain}`);
    }
  });

  test('an A whose third is quiet is still an A', () => {
    for (const gain of [0.5, 0.4, 0.3]) {
      assert.equal(detect(GUITAR_VOICINGS.A!, { gains: [1, 1, 1, gain, 1] }), 'A',
        `A with its C# at ${gain}`);
    }
  });

  test('minor chords keep their third when it is quiet too', () => {
    assert.equal(detect(GUITAR_VOICINGS.Am!, { gains: [1, 1, 1, 0.4, 1] }), 'Am');
    assert.equal(detect(GUITAR_VOICINGS.Dm!, { gains: [1, 1, 1, 0.4] }), 'Dm');
  });

  test('a chord with no third at all is still a power chord', () => {
    // The other half of the bargain: making quiet thirds count must not
    // conjure one where the player did not fret it.
    assert.equal(detect([40, 47, 52]), 'E5');
    assert.equal(detect([45, 52, 57]), 'A5');
    assert.equal(detect([50, 57, 62]), 'D5');
  });

  test('sus chords are not thirds either', () => {
    assert.equal(detect([50, 57, 62, 64]), 'Dsus2');
    assert.equal(detect([50, 57, 62, 67]), 'Dsus4');
    assert.equal(detect([45, 52, 57, 59, 64]), 'Asus2');
  });

  test('one string is never a chord, however richly it rings', () => {
    assert.equal(detect([40]), null);
    assert.equal(detect([45]), null);
  });
});

describe('the edges of what it can do', () => {
  // These are recorded rather than wished away. A detector whose limits are
  // written down can be trusted at the edges; one whose tests only cover what
  // it happens to do well cannot.

  test('sevenths keep their seventh', () => {
    // These used to come back as bare triads: the seventh is one quiet string
    // among five, and a threshold set high enough to keep noise out threw it
    // away. Corroborating a quiet string by its own octave keeps it.
    assert.equal(detect(GUITAR_VOICINGS.A7!), 'A7');
    assert.equal(detect([40, 47, 52, 56, 62, 64]), 'E7');
    assert.equal(detect([45, 52, 55, 60, 64]), 'Am7');
  });

  test('a major seventh is still reported as its triad', () => {
    // The one extension that does not survive. A major seventh sits a
    // semitone below the root's octave, so window spread off a doubled root
    // covers it either way and it cannot be told apart from the skirt.
    assert.equal(detect([48, 52, 55, 59, 64]), 'C');
  });

  test('barre chords keep their quality', () => {
    // An E-shape F barre used to tip into Fmaj7, and B minor was missed
    // outright. A barre is exactly the case where every string is fretted and
    // none of them rings like an open one, so the quiet-string rule is what
    // rescued it.
    assert.equal(detect([41, 48, 53, 57, 60, 65]), 'F');
    assert.equal(detect([47, 54, 59, 62, 66]), 'Bm');
  });

  test('two notes far apart can still be named a chord', () => {
    // A low E and a D# four octaves of harmonics apart is not something anyone
    // strums, but the detector will call it Emaj7 rather than nothing: the E's
    // own twelfth stands in for the fifth it never played. `ChordTracker`
    // needs three consecutive frames to agree before this reaches anyone.
    assert.equal(detect([40, 63]), 'Emaj7');
  });
});
