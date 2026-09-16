import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeNotes } from '../src/phrase/analyze.ts';
import { describeFretLocation, explainMood, explainPhrase, renderExplanation } from '../src/explain/explain.ts';
import { scaleNotesInRange, suggestAnswer, suggestChords, suggestEndings } from '../src/create/suggest.ts';
import { buildPracticePlan, practiceAttempt } from '../src/practice/practice.ts';
import { buildFingerprint, describeFingerprint, renderMelodicShape, suggestDeparture } from '../src/fingerprint/fingerprint.ts';
import { midiToName, nameToMidi, pitchClass } from '../src/music/notes.ts';
import { seq } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
const analysis = analyzeNotes(seq(RIFF, 380));
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi));

/** Terms a beginner should never meet before the plain-language version. */
const JARGON = [
  /minor third/i, /major third/i, /flatt?ened/i, /\bseventh\b/i, /\btonic\b/i,
  /\bdegree\b/i, /pentatonic/i, /\bmode\b/i, /\binterval\b/i,
];

describe('explaining', () => {
  test('leads with the player\'s own home note, in plain words', () => {
    const explanation = explainPhrase(analysis);
    assert.match(explanation.plain[0]!, /\bE\b/);
    assert.match(explanation.plain[0]!, /home note/i);
  });

  test('keeps every theory term out of the plain section', () => {
    for (const line of explainPhrase(analysis).plain) {
      for (const term of JARGON) {
        assert.ok(!term.test(line), `jargon "${term}" leaked into plain language: "${line}"`);
      }
    }
  });

  test('offers the theory separately, and only afterwards', () => {
    const explanation = explainPhrase(analysis);
    assert.ok(explanation.theory.some((t) => /minor third/i.test(t)));
    const rendered = renderExplanation(explanation);
    assert.ok(rendered.indexOf('home note') < rendered.indexOf('minor third'));
  });

  test('theory can be withheld entirely', () => {
    assert.ok(!renderExplanation(explainPhrase(analysis), false).includes('minor third'));
  });

  test('tells the player where to put their fingers', () => {
    assert.equal(describeFretLocation(nameToMidi('E2')), 'on your low E string, that\'s the open string');
    assert.equal(describeFretLocation(nameToMidi('G2')), 'on your low E string, that\'s the 3rd fret');
    assert.equal(describeFretLocation(nameToMidi('A2')), 'on your A string, that\'s the open string');
    assert.match(describeFretLocation(nameToMidi('C3')), /A string.*3rd fret/);
    assert.match(describeFretLocation(nameToMidi('E3')), /D string.*2nd fret/);
  });

  test('answers "why does this sound sad" by naming one note and one fret', () => {
    const mood = explainMood(analysis);
    assert.match(mood.plain[0]!, /\bG\b/);
    assert.match(mood.plain[0]!, /3rd fret/);
    assert.ok(mood.plain.some((l) => /one fret/.test(l)), 'should offer something to try');
  });

  test('does not claim a mood it cannot hear', () => {
    const ambiguous = explainMood(analyzeNotes(seq(['E2', 'A2', 'B2', 'E3'])));
    assert.match(ambiguous.plain.join(' '), /haven't played|missing/i);
  });

  test('says a bright phrase is not sad', () => {
    const bright = explainMood(analyzeNotes(seq(['C3', 'E3', 'G3', 'E3', 'C3'])));
    assert.match(bright.plain.join(' '), /isn't sad|bright/i);
  });
});

describe('suggestions', () => {
  test('offers three endings, unranked', () => {
    const endings = suggestEndings(analysis);
    assert.deepEqual(endings.map((e) => e.label), ['RESOLVED', 'UNRESOLVED', 'DARKER']);
    for (const ending of endings) {
      assert.ok(!/\bbest\b|\bshould\b/i.test(ending.description), `"${ending.description}" ranks an option`);
    }
  });

  test('every suggested note comes from the player\'s own scale', () => {
    const allowed = new Set(
      scaleNotesInRange(analysis.scale.tonicPc, [0, 3, 5, 7, 10], 20, 100).map(pitchClass),
    );
    for (const ending of suggestEndings(analysis)) {
      for (const note of ending.notes) {
        assert.ok(allowed.has(pitchClass(note.midi)), `${midiToName(note.midi)} is outside the scale`);
      }
    }
  });

  test('the resolved ending lands on the home note', () => {
    const resolved = suggestEndings(analysis).find((e) => e.kind === 'resolved')!;
    const last = resolved.notes[resolved.notes.length - 1]!;
    assert.equal(pitchClass(last.midi), analysis.scale.tonicPc);
  });

  test('the unresolved ending does not land on the home note', () => {
    const unresolved = suggestEndings(analysis).find((e) => e.kind === 'unresolved')!;
    const last = unresolved.notes[unresolved.notes.length - 1]!;
    assert.notEqual(pitchClass(last.midi), analysis.scale.tonicPc);
  });

  test('suggestions continue the phrase rather than overlapping it', () => {
    for (const ending of suggestEndings(analysis)) {
      const phraseEnd = analysis.phrase.notes[analysis.phrase.notes.length - 1]!.startMs;
      assert.ok(ending.notes[0]!.startMs > phraseEnd);
      assert.equal(ending.full.length, analysis.phrase.notes.length + ending.notes.length);
    }
  });

  test('never suggests simply replaying the note just played', () => {
    const resolved = suggestEndings(analysis).find((e) => e.kind === 'resolved')!;
    const lastPlayed = analysis.phrase.notes[analysis.phrase.notes.length - 1]!.midi;
    assert.ok(
      resolved.notes.length > 1 || resolved.notes[0]!.midi !== lastPlayed,
      'repeating the last note is not a suggestion',
    );
  });

  test('the answering phrase mirrors the shape and stays in range', () => {
    const answer = suggestAnswer(analysis)!;
    assert.equal(answer.notes.length, analysis.phrase.notes.length);
    // Where the phrase rose, the answer falls.
    const phraseNet = analysis.phrase.notes[3]!.midi - analysis.phrase.notes[0]!.midi;
    const answerNet = answer.notes[3]!.midi - answer.notes[0]!.midi;
    assert.ok(Math.sign(phraseNet) === -Math.sign(answerNet), 'the answer should invert the shape');
    // No repeated notes from clamping at the edge of the range.
    const distinct = new Set(answer.notes.map((n) => n.midi));
    assert.ok(distinct.size >= 4, `inversion collapsed: ${names(answer.notes)}`);
  });

  test('never suggests a note that does not exist on the guitar', () => {
    // A riff already sitting on the lowest string: mirroring it must not run
    // off the bottom of the instrument.
    const low = analyzeNotes(seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2'], 380));
    const suggested = [
      ...suggestEndings(low).flatMap((e) => e.notes),
      ...(suggestAnswer(low)?.notes ?? []),
    ];
    assert.ok(suggested.length > 0);
    for (const note of suggested) {
      assert.ok(note.midi >= nameToMidi('E2'), `${midiToName(note.midi)} is below the low E string`);
      assert.ok(note.midi <= nameToMidi('D6'), `${midiToName(note.midi)} is past the last fret`);
    }
  });

  test('respects an alternate tuning\'s range', () => {
    const low = analyzeNotes(seq(['D2', 'F2', 'G2', 'A2', 'F2', 'D2'], 380));
    const answer = suggestAnswer(low, { tuning: { name: 'Drop D', strings: [38, 45, 50, 55, 59, 64] } });
    for (const note of answer?.notes ?? []) assert.ok(note.midi >= 38);
  });

  test('suggests a chord built on the home note first', () => {
    const chords = suggestChords(analysis);
    assert.equal(chords[0]!.label, 'E minor');
    assert.ok(chords[0]!.fit > 0.7);
    assert.match(chords[0]!.description, /home note/);
  });

  test('says nothing about nothing', () => {
    const empty = analyzeNotes([]);
    assert.deepEqual(suggestEndings(empty), []);
    assert.equal(suggestAnswer(empty), null);
    assert.deepEqual(suggestChords(empty), []);
  });
});

describe('practice mode', () => {
  const reference = seq(RIFF, 400);

  test('recognises a perfect attempt', () => {
    const result = practiceAttempt(reference, seq(RIFF, 400));
    assert.ok(result.nailed);
    assert.equal(result.accuracy, 1);
    assert.match(result.feedback[0]!, /that's it/i);
  });

  test('leads with what went right, then names the wrong note', () => {
    const result = practiceAttempt(reference, seq(['E2', 'G2', 'A2', 'G2', 'G2', 'E2'], 400));
    assert.match(result.feedback[0]!, /nailed the opening/i);
    assert.ok(result.feedback.some((f) => /G2 instead of B2/.test(f)));
    assert.equal(result.feedback[result.feedback.length - 1], 'Try it again.');
  });

  test('mentions tempo drift in percentage terms', () => {
    const result = practiceAttempt(reference, seq(RIFF, 300));
    assert.ok(result.feedback.some((f) => /\d+% faster/.test(f)));
  });

  test('tolerates small tempo differences without nagging', () => {
    const result = practiceAttempt(reference, seq(RIFF, 410));
    assert.ok(!result.feedback.some((f) => /faster|slower/.test(f)));
  });

  test('does not call a run perfect when it is buried in extra notes', () => {
    const noisy = seq([...RIFF, 'C3', 'D3', 'E3', 'G3', 'A3', 'C4'], 400);
    const result = practiceAttempt(reference, noisy);
    assert.ok(result.accuracy < 0.6, `right notes plus six wrong ones scored ${result.accuracy}`);
    assert.ok(!result.nailed);
  });

  test('a note-perfect run is still 100%', () => {
    assert.equal(practiceAttempt(reference, seq(RIFF, 400)).accuracy, 1);
  });

  test('handles hearing nothing at all', () => {
    const result = practiceAttempt(reference, []);
    assert.equal(result.accuracy, 0);
    assert.match(result.feedback[0]!, /didn't hear anything/i);
  });

  test('counts how far in the first mistake was', () => {
    const result = practiceAttempt(reference, seq(['E2', 'G2', 'A2', 'G2', 'G2', 'E2'], 400));
    assert.equal(result.openingRun, 3);
    assert.equal(result.firstMistakeIndex, 3);
  });

  test('slowing a riff down leaves the notes alone', () => {
    const version = { id: 'v', label: 'Version A', parentId: null, notes: reference, createdAt: 0 };
    const plan = buildPracticePlan(version, 'original', 0.5);
    assert.deepEqual(plan.notes.map((n) => n.midi), reference.map((n) => n.midi));
    assert.equal(plan.notes[1]!.startMs - plan.notes[0]!.startMs, 800);
    assert.match(plan.label, /50% speed/);
  });

  test('refuses a nonsensical speed', () => {
    const version = { id: 'v', label: 'Version A', parentId: null, notes: reference, createdAt: 0 };
    assert.throws(() => buildPracticePlan(version, 'original', 0));
    assert.throws(() => buildPracticePlan(version, 'original', 5));
  });
});

describe('musical fingerprint', () => {
  test('refuses to invent habits from too little material', () => {
    const fingerprint = buildFingerprint([seq(RIFF), seq(RIFF)]);
    assert.ok(!fingerprint.hasEnoughMaterial);
    assert.match(describeFingerprint(fingerprint)[0]!, /noise|only \d+/i);
    assert.equal(suggestDeparture(fingerprint), null);
  });

  test('spots the home note a player keeps returning to', () => {
    const takes = [
      seq(RIFF), seq(['E2', 'G2', 'B2', 'E3', 'B2', 'E2']),
      seq(['E2', 'A2', 'B2', 'G2', 'E2']), seq(['E2', 'D3', 'B2', 'G2', 'E2']),
      seq(['C3', 'D3', 'E3', 'G3', 'C3']),
    ];
    const fingerprint = buildFingerprint(takes);
    assert.ok(fingerprint.hasEnoughMaterial);
    assert.equal(fingerprint.tonalCenters[0]!.label, 'E');
    assert.match(describeFingerprint(fingerprint).join(' '), /return to E/);
  });

  test('renders a recurring move the way the player would picture it', () => {
    assert.equal(renderMelodicShape([3, 2]), '0 → 3 → 5');
  });

  test('notices a downward resolving habit and offers a way out', () => {
    const takes = [
      seq(['E2', 'G2', 'A2', 'B2', 'G2', 'E2']), seq(['A2', 'C3', 'D3', 'C3', 'A2']),
      seq(['D3', 'F3', 'G3', 'F3', 'D3']), seq(['G2', 'A#2', 'C3', 'A#2', 'G2']),
    ];
    const fingerprint = buildFingerprint(takes);
    assert.equal(fingerprint.resolution.tendency, 'down');
    assert.match(describeFingerprint(fingerprint).join(' '), /resolve downward/);
    assert.match(suggestDeparture(fingerprint)!, /climb/i);
  });

  test('never phrases a habit as a fault', () => {
    const takes = [seq(RIFF), seq(RIFF), seq(['A2', 'C3', 'D3', 'C3', 'A2']), seq(['E2', 'G2', 'B2', 'G2', 'E2'])];
    const lines = [...describeFingerprint(buildFingerprint(takes)), suggestDeparture(buildFingerprint(takes)) ?? ''];
    for (const line of lines) {
      assert.ok(!/\b(should|wrong|bad|avoid|stop|too much|problem)\b/i.test(line), `judgemental: "${line}"`);
    }
  });

  test('describes the register a player lives in', () => {
    const fingerprint = buildFingerprint([seq(RIFF), seq(RIFF), seq(RIFF), seq(RIFF)]);
    assert.equal(fingerprint.register.lowest, nameToMidi('E2'));
    assert.equal(fingerprint.register.highest, nameToMidi('B2'));
  });
});
