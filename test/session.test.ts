import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SketchbookSession } from '../src/session/session.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { midiToName } from '../src/music/notes.ts';
import { pluck, seqAt, synthesize } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
const VARIATION = ['E2', 'G2', 'A2', 'C3', 'B2', 'G2'];
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi));

/** The session from the product vision: a riff, a detour, two revisits. */
function playVisionSession(session: SketchbookSession) {
  session.addNotes(seqAt(RIFF, 0, 300));
  session.addNotes(seqAt(['C3', 'D3', 'E3', 'G3'], 3200, 300));
  session.addNotes(seqAt(VARIATION, 6000, 300));
  session.addNotes(seqAt(RIFF, 9300, 300, 0.99));
  session.memory.tick(11_500);
}

describe('listening', () => {
  test('hears notes fed directly and tells anyone listening', () => {
    const session = new SketchbookSession();
    const heard: number[] = [];
    session.onNote((note) => heard.push(note.midi));
    session.addNotes(seqAt(RIFF, 0, 300));
    assert.equal(heard.length, RIFF.length);
  });

  test('stops telling a listener that has unsubscribed', () => {
    const session = new SketchbookSession();
    let count = 0;
    const off = session.onNote(() => { count++; });
    session.addNotes(seqAt(['E2'], 0, 300));
    off();
    session.addNotes(seqAt(['G2'], 1000, 300));
    assert.equal(count, 1);
  });

  test('carves what it heard into musical ideas', () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    assert.equal(session.phrases().length, 4);
    assert.equal(session.motifs()[0]!.takes.length, 3);
  });

  test('refuses raw audio it was not set up to receive', () => {
    assert.throws(() => new SketchbookSession().feedAudio(new Float32Array(128)));
  });

  test('takes raw audio when configured, end to end', () => {
    const session = new SketchbookSession({ audio: { sampleRate: 44100 } });
    const audio = synthesize(pluck(RIFF));
    for (let offset = 0; offset < audio.length; offset += 512) {
      session.feedAudio(audio.subarray(offset, Math.min(offset + 512, audio.length)));
    }
    session.flush();
    assert.deepEqual(names(session.memory.all()), RIFF);
  });
});

describe('what did I just play?', () => {
  test('finds the idea, counts the takes, and picks the cleanest', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);

    const recall = (await session.whatDidIJustPlay())!;
    assert.ok(recall);
    assert.equal(recall.takes.length, 3);
    assert.deepEqual(names(recall.takes[0]!.phrase.notes), RIFF);
    assert.deepEqual(names(recall.takes[1]!.phrase.notes), VARIATION);
    assert.equal(recall.cleanest.startMs, 9300);
    assert.ok(recall.takes[2]!.isCleanest);
  });

  test('says how long ago it was', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    const recall = (await session.whatDidIJustPlay())!;
    // The first take began at 0ms and the session clock is at 11.5s.
    assert.equal(recall.takes[0]!.secondsAgo, 12);
    assert.match(recall.say, /about 12 seconds ago/);
  });

  test('narrates it the way another musician would', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    const { say } = (await session.whatDidIJustPlay())!;

    assert.match(say, /I think you mean this phrase/);
    assert.match(say, /E2 → G2 → A2 → B2 → G2 → E2/);
    assert.match(say, /You played a variation of it three times/);
    assert.match(say, /The second version was:/);
    assert.match(say, /E2 → G2 → A2 → C3 → B2 → G2/);
    assert.match(say, /The third version was the cleanest/);
    assert.match(say, /Do you want to save one of them as a riff\?/);
  });

  test('explains what changed between takes', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    const recall = (await session.whatDidIJustPlay())!;
    assert.equal(recall.takes[0]!.diffFromFirst, null);
    assert.ok(recall.takes[1]!.diffFromFirst);
    assert.match(recall.takes[1]!.diffFromFirst!.summary, /C3/);
  });

  test('does not pretend to remember something that was never played', async () => {
    assert.equal(await new SketchbookSession().whatDidIJustPlay(), null);
  });

  test('mentions an older saved riff it resembles', async () => {
    const library = new RiffLibrary();
    await library.saveRiff(seqAt(RIFF, 0, 300), {
      name: 'Weird E Minor Thing',
      createdAt: Date.now() - 21 * 86_400_000,
    });
    const session = new SketchbookSession({ library });
    playVisionSession(session);

    const recall = (await session.whatDidIJustPlay())!;
    assert.equal(recall.matches[0]?.riffName, 'Weird E Minor Thing');
    assert.match(recall.say, /very close to Weird E Minor Thing from about 21 days ago/);
  });

  test('ghost capture rewinds a chosen number of seconds', () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    // A rewind is literal: 2.5s reaches back over exactly the last take...
    assert.deepEqual(names(session.ghostCapture(2.5)), RIFF);
    // ...and reaching further back catches the tail of the previous one too.
    const longer = session.ghostCapture(5);
    assert.ok(longer.length > RIFF.length);
    assert.deepEqual(names(longer).slice(-RIFF.length), RIFF);
    assert.ok(longer[0]!.startMs >= session.currentTimeMs - 5000);
  });

  test('ghost capture holds nothing older than the memory window', () => {
    const session = new SketchbookSession({ memoryWindowMs: 4000 });
    playVisionSession(session);
    assert.ok(session.ghostCapture(60).every((n) => n.startMs >= 11_500 - 4000));
  });
});

describe('saving', () => {
  test('saves the last idea without needing a name', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    const riff = (await session.saveLastPhrase())!;
    assert.equal(riff.name, null);
    assert.deepEqual(names(riff.versions[0]!.notes), RIFF);
  });

  test('saves a take onto an existing riff as a new version', async () => {
    const session = new SketchbookSession();
    playVisionSession(session);
    const riff = (await session.saveLastPhrase({ name: 'Late Night Thing' }))!;
    const phrases = session.phrases();
    const version = await session.saveAsVersion(riff.id, phrases[2]!, 'the one with the C');

    assert.equal(version.label, 'Version B');
    assert.equal(version.comment, 'the one with the C');
    assert.equal((await session.library.getRiff(riff.id))!.versions.length, 2);
  });

  test('has nothing to save before anything is played', async () => {
    assert.equal(await new SketchbookSession().saveLastPhrase(), null);
  });

  test('keeps no audio unless asked to', async () => {
    const session = new SketchbookSession({ audio: { sampleRate: 44100 } });
    const audio = synthesize(pluck(RIFF));
    for (let offset = 0; offset < audio.length; offset += 512) {
      session.feedAudio(audio.subarray(offset, Math.min(offset + 512, audio.length)));
    }
    session.flush();
    assert.equal(session.audioRing, null, 'audio retention must be opt-in');
    const riff = (await session.saveLastPhrase())!;
    assert.equal(riff.versions[0]!.audioRef, undefined);
  });

  test('keeps the clip for a saved riff when retention is switched on', async () => {
    const session = new SketchbookSession({ audio: { sampleRate: 44100, retainAudio: true } });
    const audio = synthesize(pluck(RIFF));
    for (let offset = 0; offset < audio.length; offset += 512) {
      session.feedAudio(audio.subarray(offset, Math.min(offset + 512, audio.length)));
    }
    session.flush();

    const riff = (await session.saveLastPhrase())!;
    const audioRef = riff.versions[0]!.audioRef;
    assert.ok(audioRef, 'a saved riff should carry its recording');
    const clip = session.getClip(audioRef)!;
    assert.ok(clip.length > 44100, 'the clip should cover the whole phrase');
    assert.equal(session.savedClips.size, 1, 'only what was saved is kept');
  });

  test('clearing the session forgets the notes and the audio', () => {
    const session = new SketchbookSession({ audio: { sampleRate: 44100, retainAudio: true } });
    session.addNotes(seqAt(RIFF, 0, 300));
    session.clear();
    assert.equal(session.memory.size, 0);
    assert.equal(session.audioRing!.durationMs, 0);
  });
});
