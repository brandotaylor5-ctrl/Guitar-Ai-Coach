import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SketchbookSession } from '../src/session/session.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { practiceVersion, practiceAttempt, buildPracticePlan } from '../src/practice/practice.ts';
import { DADGAD_TUNING, STANDARD_TUNING, customTuning, withCapo, positionsFor } from '../src/music/fretboard.ts';
import { noiseGate } from '../src/audio/calibration.ts';
import { seq } from './helpers.ts';

const riffNotes = ['E2', 'G2', 'A2', 'B2', 'E2'];

test('external pitch detection still expires notes when silent audio arrives', () => {
  const session = new SketchbookSession({
    memoryWindowMs: 1000, audio: { sampleRate: 1000, retainAudio: true, detect: false },
  });
  session.addNotes(seq(['E2'], 200));
  session.feedAudio(new Float32Array(2000));
  assert.equal(session.memory.size, 0);
});

test('unsolicited echoes wait for silence, but explicit recall can use the unfinished idea', async () => {
  const library = new RiffLibrary();
  await library.saveRiff(seq(riffNotes));
  const session = new SketchbookSession({ library });
  session.addNotes(seq(riffNotes));
  assert.deepEqual(await session.newEchoes(), []);
  assert.ok(await session.whatDidIJustPlay());
  session.memory.tick(4000);
  assert.equal((await session.newEchoes()).length, 1);
  assert.equal((await session.newEchoes()).length, 0);
});

test('practice selects actual original, latest and cleanest branches', async () => {
  const library = new RiffLibrary();
  const riff = await library.saveRiff(seq(riffNotes, 400, 0.8));
  const best = await library.addVersion(riff.id, seq(['G2', 'A2', 'B2'], 400, 1));
  const latest = await library.addVersion(riff.id, seq(['E2', 'B2'], 400, 0.5),
    { parentId: riff.versions[0]!.id, makeCurrent: false });
  const updated = (await library.getRiff(riff.id))!;
  assert.equal(practiceVersion(updated, 'original').id, riff.versions[0]!.id);
  assert.equal(practiceVersion(updated, 'latest').id, latest.id);
  assert.equal(practiceVersion(updated, 'best').id, best.id);
});

test('matching pitches at the wrong tempo do not count as nailed', () => {
  const result = practiceAttempt(seq(riffNotes, 400), seq(riffNotes, 200));
  assert.equal(result.accuracy, 1);
  assert.equal(result.nailed, false);
});

test('half-speed attempts are judged against the half-speed plan', async () => {
  const library = new RiffLibrary();
  const riff = await library.saveRiff(seq(riffNotes));
  const plan = buildPracticePlan(riff.versions[0]!, 'original', 0.5);
  assert.equal(practiceAttempt(plan.notes, plan.notes).nailed, true);
  assert.deepEqual(plan.notes.map((n) => n.midi), riff.versions[0]!.notes.map((n) => n.midi));
});

test('exports remove recording references without mutating the saved library', async () => {
  const library = new RiffLibrary();
  const riff = await library.saveRiff(seq(riffNotes), { audioRef: 'clip:local-only' });
  const json = await library.export();
  assert.equal(json.includes('audioRef'), false);
  assert.equal((await library.getRiff(riff.id))!.versions[0]!.audioRef, 'clip:local-only');
  const imported = new RiffLibrary();
  await imported.import(JSON.stringify({ riffs: [riff], songs: [] }));
  assert.equal((await imported.getRiff(riff.id))!.versions[0]!.audioRef, undefined);
});

test('empty versions are rejected without changing existing history', async () => {
  const library = new RiffLibrary();
  const riff = await library.saveRiff(seq(riffNotes));
  await assert.rejects(library.addVersion(riff.id, []), /empty/);
  assert.equal((await library.getRiff(riff.id))!.versions.length, 1);
});

test('DADGAD and capo infer open strings from sounding pitches', () => {
  assert.deepEqual(customTuning('D2 A2 D3 G3 A3 D4').strings, DADGAD_TUNING.strings);
  const tuning = withCapo(STANDARD_TUNING, 2);
  assert.ok(positionsFor(42, tuning).some((p) => p.string === 0 && p.fret === 0));
  assert.equal(STANDARD_TUNING.strings[0], 40);
  assert.throws(() => withCapo(STANDARD_TUNING, 2.5));
  assert.throws(() => customTuning('E A D G B E'));
  assert.throws(() => customTuning('E2 A2 D3'));
});

test('noise calibration adapts to a quiet room and rejects unusable readings', () => {
  assert.equal(noiseGate(Array(20).fill(0.004)), 0.012);
  assert.equal(noiseGate(Array(20).fill(0)), 0.002);
  assert.throws(() => noiseGate([]), /readings/);
  assert.throws(() => noiseGate(Array(20).fill(0.2)), /loud/);
});
