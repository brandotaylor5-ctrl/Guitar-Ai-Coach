import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RiffLibrary, versionLabel } from '../src/library/riffLibrary.ts';
import { InMemoryRiffStore } from '../src/library/store.ts';
import { JsonFileRiffStore } from '../src/library/fileStore.ts';
import { LocalStorageRiffStore } from '../src/library/localStorageStore.ts';
import type { StorageLike } from '../src/library/localStorageStore.ts';
import { transpose } from '../src/phrase/edit.ts';
import { midiToName } from '../src/music/notes.ts';
import { seq } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];
const VARIATION = ['E2', 'G2', 'A2', 'C3', 'B2', 'G2'];
const names = (notes: { midi: number }[]) => notes.map((n) => midiToName(n.midi));
const DAY = 86_400_000;

describe('version labels', () => {
  test('run A, B, C and keep going past Z', () => {
    assert.equal(versionLabel(0), 'Version A');
    assert.equal(versionLabel(25), 'Version Z');
    assert.equal(versionLabel(26), 'Version AA');
    assert.equal(versionLabel(51), 'Version AZ');
    assert.equal(versionLabel(52), 'Version BA');
  });
});

describe('riff library', () => {
  test('saves an idea without demanding a name for it', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    assert.equal(riff.name, null);
    assert.equal(riff.versions.length, 1);
    assert.equal(riff.versions[0]!.label, 'Version A');
    assert.equal(riff.versions[0]!.parentId, null);
  });

  test('refuses to save an empty riff', async () => {
    await assert.rejects(() => new RiffLibrary().saveRiff([]));
  });

  test('a new take never overwrites the old one', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF), { name: 'Late Night Thing' });
    await library.addVersion(riff.id, seq(VARIATION));

    const reloaded = (await library.getRiff(riff.id))!;
    assert.equal(reloaded.versions.length, 2);
    assert.deepEqual(names(reloaded.versions[0]!.notes), RIFF, 'Version A must survive');
    assert.deepEqual(names(reloaded.versions[1]!.notes), VARIATION);
  });

  test('versions branch from where they grew, not from the newest', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    const rootId = riff.versions[0]!.id;
    const b = await library.addVersion(riff.id, seq(VARIATION));
    const c = await library.addVersion(riff.id, seq(['E2', 'G2', 'B2']), { parentId: rootId });

    assert.equal(b.parentId, rootId);
    assert.equal(c.parentId, rootId);
    const tree = await library.versionTree(riff.id);
    assert.equal(tree.length, 1, 'one root');
    assert.equal(tree[0]!.children.length, 2, 'two branches off it');
  });

  test('keeping a version changes the front door, discarding nothing', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    const b = await library.addVersion(riff.id, seq(VARIATION));
    await library.setCurrentVersion(riff.id, riff.versions[0]!.id);

    assert.equal((await library.currentVersion(riff.id)).label, 'Version A');
    assert.equal((await library.getRiff(riff.id))!.versions.length, 2);
    assert.ok(await library.getVersion(riff.id, b.id), 'Version B must still exist');
  });

  test('combining two versions produces a third, leaving both alone', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    const b = await library.addVersion(riff.id, seq(VARIATION));
    const combined = await library.combineVersions(riff.id, riff.versions[0]!.id, b.id);

    assert.equal(combined.label, 'Version C');
    assert.equal(combined.parentId, riff.versions[0]!.id);
    assert.match(combined.comment!, /Opening of Version A/);
    assert.equal((await library.getRiff(riff.id))!.versions.length, 3);
  });

  test('finds the original, the latest and the cleanest take', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF, 400, 0.6), { createdAt: 1000 });
    await library.addVersion(riff.id, seq(VARIATION, 400, 0.65), { createdAt: 2000 });
    const best = await library.addVersion(riff.id, seq(RIFF, 400, 0.99), { createdAt: 3000 });

    assert.equal((await library.originalVersion(riff.id)).label, 'Version A');
    assert.equal((await library.latestVersion(riff.id)).id, best.id);
    assert.equal((await library.bestTake(riff.id)).id, best.id);
  });

  test('recognises an old idea played again, and says how old', async () => {
    const library = new RiffLibrary();
    const threeWeeksAgo = Date.now() - 21 * DAY;
    await library.saveRiff(seq(RIFF), { name: 'Weird E Minor Thing', createdAt: threeWeeksAgo });
    await library.saveRiff(seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2']), { name: 'Something Else' });

    const matches = await library.findSimilar(seq(RIFF));
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.riffName, 'Weird E Minor Thing');
    assert.ok(matches[0]!.similarity > 0.95);
    assert.equal(matches[0]!.createdAt, threeWeeksAgo);
  });

  test('recognises the same idea played in another key', async () => {
    const library = new RiffLibrary();
    await library.saveRiff(seq(RIFF), { name: 'Nylon Idea' });
    const matches = await library.findSimilar(transpose(seq(RIFF), 5));
    assert.equal(matches[0]?.riffName, 'Nylon Idea');
  });

  test('matches against abandoned branches, not just the current version', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2']), { name: 'Riff 12' });
    const branch = await library.addVersion(riff.id, seq(RIFF));
    await library.setCurrentVersion(riff.id, riff.versions[0]!.id);

    const matches = await library.findSimilar(seq(RIFF));
    assert.equal(matches[0]?.versionId, branch.id);
  });

  test('stays quiet when nothing matches', async () => {
    const library = new RiffLibrary();
    await library.saveRiff(seq(RIFF));
    assert.deepEqual(await library.findSimilar(seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2'])), []);
  });

  test('renames and annotates without touching the music', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    await library.rename(riff.id, 'Late Night Thing');
    const annotated = await library.annotate(riff.id, 'try this with the capo on 2');

    assert.equal(annotated.name, 'Late Night Thing');
    assert.equal(annotated.notes, 'try this with the capo on 2');
    assert.deepEqual(names(annotated.versions[0]!.notes), RIFF);
  });

  test('rejects operations on riffs and versions that do not exist', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF));
    await assert.rejects(() => library.addVersion('nope', seq(RIFF)));
    await assert.rejects(() => library.addVersion(riff.id, seq(RIFF), { parentId: 'nope' }));
    await assert.rejects(() => library.setCurrentVersion(riff.id, 'nope'));
  });
});

describe('song seeds', () => {
  test('groups riffs into a song without merging them', async () => {
    const library = new RiffLibrary();
    const verse = await library.saveRiff(seq(RIFF), { name: 'Riff 4' });
    const chorus = await library.saveRiff(seq(VARIATION), { name: 'Riff 9' });

    let song = await library.createSong('Song Idea 01');
    song = await library.addToSong(song.id, 'verse', verse.id);
    song = await library.addToSong(song.id, 'chorus', chorus.id);

    assert.deepEqual(song.sections.map((s) => s.role), ['verse', 'chorus']);
    assert.equal((await library.listRiffs()).length, 2, 'the riffs stay separate');
  });

  test('notices riffs that might belong together', async () => {
    const library = new RiffLibrary();
    const verse = await library.saveRiff(seq(RIFF), { name: 'Riff 4' });
    await library.saveRiff(seq(VARIATION), { name: 'Riff 9' });
    await library.saveRiff(seq(['C3', 'C3', 'F3', 'A3', 'D3', 'F2']), { name: 'Riff 13' });

    const related = await library.relatedRiffs(verse.id);
    assert.equal(related[0]!.riff.name, 'Riff 9');
    assert.ok(related.every((r) => r.riff.name !== 'Riff 4'), 'never relates a riff to itself');
  });
});

describe('persistence', () => {
  test('a library survives being closed and reopened', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riffs-'));
    const path = join(dir, 'library.json');
    try {
      const first = new RiffLibrary(new JsonFileRiffStore(path));
      const riff = await first.saveRiff(seq(RIFF), { name: 'Late Night Thing' });
      await first.addVersion(riff.id, seq(VARIATION), { comment: 'darker ending' });

      const reopened = new RiffLibrary(new JsonFileRiffStore(path));
      const riffs = await reopened.listRiffs();
      assert.equal(riffs.length, 1);
      assert.equal(riffs[0]!.name, 'Late Night Thing');
      assert.equal(riffs[0]!.versions.length, 2);
      assert.equal(riffs[0]!.versions[1]!.comment, 'darker ending');
      assert.deepEqual(names(riffs[0]!.versions[0]!.notes), RIFF);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('an empty library file is not an error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riffs-'));
    try {
      const library = new RiffLibrary(new JsonFileRiffStore(join(dir, 'nested', 'library.json')));
      assert.deepEqual(await library.listRiffs(), []);
      await library.saveRiff(seq(RIFF));
      assert.equal((await library.listRiffs()).length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('two libraries never share each other\'s riffs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'riffs-'));
    try {
      const mine = new RiffLibrary(new JsonFileRiffStore(join(dir, 'mine.json')));
      const yours = new RiffLibrary(new JsonFileRiffStore(join(dir, 'yours.json')));
      await mine.saveRiff(seq(RIFF), { name: 'Mine' });
      assert.deepEqual(await yours.listRiffs(), [], 'an empty library must stay empty');
      await yours.saveRiff(seq(VARIATION), { name: 'Yours' });
      assert.deepEqual((await mine.listRiffs()).map((r) => r.name), ['Mine']);
      assert.deepEqual((await yours.listRiffs()).map((r) => r.name), ['Yours']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('deleting removes the riff and nothing else', async () => {
    const library = new RiffLibrary(new InMemoryRiffStore());
    const a = await library.saveRiff(seq(RIFF));
    await library.saveRiff(seq(VARIATION));
    await library.deleteRiff(a.id);
    assert.equal((await library.listRiffs()).length, 1);
    assert.equal(await library.getRiff(a.id), null);
  });
});

describe('browser storage', () => {
  /** A stand-in for window.localStorage, so this runs anywhere. */
  function fakeStorage(): StorageLike & { fail: boolean } {
    const entries = new Map<string, string>();
    return {
      fail: false,
      getItem: (key) => entries.get(key) ?? null,
      setItem(key, value) {
        if (this.fail) throw new Error('QuotaExceededError');
        entries.set(key, value);
      },
      removeItem: (key) => { entries.delete(key); },
    };
  }

  test('a library survives the tab being closed', async () => {
    const storage = fakeStorage();
    const first = new RiffLibrary(new LocalStorageRiffStore(storage));
    const riff = await first.saveRiff(seq(RIFF), { name: 'Late Night Thing' });
    await first.addVersion(riff.id, seq(VARIATION), { comment: 'darker ending' });

    const reopened = new RiffLibrary(new LocalStorageRiffStore(storage));
    const riffs = await reopened.listRiffs();
    assert.equal(riffs.length, 1);
    assert.equal(riffs[0]!.versions.length, 2);
    assert.deepEqual(names(riffs[0]!.versions[0]!.notes), RIFF);
  });

  test('starts empty rather than throwing on corrupt storage', async () => {
    const storage = fakeStorage();
    storage.setItem('guitar-ai-coach.library.v1', '{not json');
    const library = new RiffLibrary(new LocalStorageRiffStore(storage));
    assert.deepEqual(await library.listRiffs(), []);
  });

  test('explains itself when storage is full', async () => {
    const storage = fakeStorage();
    const library = new RiffLibrary(new LocalStorageRiffStore(storage));
    storage.fail = true;
    await assert.rejects(() => library.saveRiff(seq(RIFF)), /browser storage/i);
  });

  test('exports and re-imports without duplicating riffs', async () => {
    const library = new RiffLibrary(new LocalStorageRiffStore(fakeStorage()));
    const riff = await library.saveRiff(seq(RIFF), { name: 'Late Night Thing' });
    await library.addVersion(riff.id, seq(VARIATION));
    const exported = await library.export();

    const elsewhere = new RiffLibrary(new LocalStorageRiffStore(fakeStorage()));
    assert.deepEqual(await elsewhere.import(exported), { riffs: 1, songs: 0, skipped: 0 });
    assert.deepEqual(await elsewhere.import(exported), { riffs: 0, songs: 0, skipped: 1 });

    const imported = await elsewhere.listRiffs();
    assert.equal(imported.length, 1);
    assert.equal(imported[0]!.versions.length, 2, 'every version should come across');
    assert.deepEqual(names(imported[0]!.versions[0]!.notes), RIFF);
  });

  test('two keys keep two separate libraries', async () => {
    const storage = fakeStorage();
    const mine = new RiffLibrary(new LocalStorageRiffStore(storage, 'mine'));
    const yours = new RiffLibrary(new LocalStorageRiffStore(storage, 'yours'));
    await mine.saveRiff(seq(RIFF), { name: 'Mine' });
    assert.deepEqual(await yours.listRiffs(), []);
  });
});

describe('arranging a song', () => {
  async function songWith(library: RiffLibrary) {
    const verse = await library.saveRiff(seq(RIFF), { name: 'Riff 4' });
    const chorus = await library.saveRiff(seq(VARIATION), { name: 'Riff 9' });
    const bridge = await library.saveRiff(seq(['C3', 'C3', 'F3', 'A3']), { name: 'Riff 13' });
    let song = await library.createSong('Song Idea 01');
    song = await library.addToSong(song.id, 'verse', verse.id);
    song = await library.addToSong(song.id, 'chorus', chorus.id);
    song = await library.addToSong(song.id, 'transition', bridge.id);
    return { song, verse, chorus, bridge };
  }

  test('sections can be reordered', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    const moved = await library.moveSection(song.id, 2, 0);
    assert.deepEqual(moved.sections.map((s) => s.role), ['transition', 'verse', 'chorus']);
  });

  test('moving to the end works, and out-of-range is clamped not crashed', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    const moved = await library.moveSection(song.id, 0, 99);
    assert.deepEqual(moved.sections.map((s) => s.role), ['chorus', 'transition', 'verse']);
    await assert.rejects(() => library.moveSection(song.id, 7, 0));
  });

  test('a section can be removed or renamed without touching the riff', async () => {
    const library = new RiffLibrary();
    const { song, chorus } = await songWith(library);
    const renamed = await library.setSectionRole(song.id, 1, 'pre-chorus');
    assert.equal(renamed.sections[1]!.role, 'pre-chorus');

    const removed = await library.removeFromSong(song.id, 1);
    assert.deepEqual(removed.sections.map((s) => s.role), ['verse', 'transition']);
    assert.ok(await library.getRiff(chorus.id), 'removing a section must not delete the riff');
  });

  test('plays the arrangement through in order', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    const notes = await library.songNotes(song.id);
    assert.equal(notes.length, RIFF.length + VARIATION.length + 4);
    assert.deepEqual(names(notes).slice(0, RIFF.length), RIFF);
  });

  test('sections are laid end to end in time, not stacked on top of each other', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    const notes = await library.songNotes(song.id);
    for (let i = 1; i < notes.length; i++) {
      assert.ok(
        notes[i]!.startMs > notes[i - 1]!.startMs,
        `note ${i} starts at ${notes[i]!.startMs}, before note ${i - 1} at ${notes[i - 1]!.startMs}`,
      );
    }
  });

  test('a section keeps its own timing within itself', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    const notes = await library.songNotes(song.id);
    const firstGap = notes[1]!.startMs - notes[0]!.startMs;
    assert.equal(firstGap, 400, 'the riff should still be played at the speed it was written');
  });

  test('skips a section whose riff has been deleted rather than failing', async () => {
    const library = new RiffLibrary();
    const { song, chorus } = await songWith(library);
    await library.deleteRiff(chorus.id);
    const notes = await library.songNotes(song.id);
    assert.equal(notes.length, RIFF.length + 4);
  });

  test('renaming and deleting a song leaves the riffs alone', async () => {
    const library = new RiffLibrary();
    const { song } = await songWith(library);
    assert.equal((await library.renameSong(song.id, 'The Good One')).name, 'The Good One');
    await library.deleteSong(song.id);
    assert.deepEqual(await library.listSongs(), []);
    assert.equal((await library.listRiffs()).length, 3);
  });
});

describe('taking your ideas with you', () => {
  test('carries songs across as well as riffs', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF), { name: 'Riff 4' });
    const song = await library.createSong('Song Idea 01');
    await library.addToSong(song.id, 'verse', riff.id);

    const elsewhere = new RiffLibrary();
    assert.deepEqual(await elsewhere.import(await library.export()), { riffs: 1, songs: 1, skipped: 0 });
    assert.equal((await elsewhere.listSongs())[0]!.sections.length, 1);
  });

  test('never replaces work with an older copy of itself', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF), { name: 'Late Night Thing' });
    const snapshot = await library.export();
    await library.addVersion(riff.id, seq(VARIATION), { comment: 'newer work' });

    await library.import(snapshot);
    const after = await library.listRiffs();
    assert.equal(after.length, 1);
    assert.equal(after[0]!.versions.length, 2, 'the newer version must survive the import');
  });

  test('refuses a file that is not a library', async () => {
    const library = new RiffLibrary();
    await assert.rejects(() => library.import('{not json'), /not a riff library/i);
    await assert.rejects(() => library.import('{"hello":true}'), /not a riff library/i);
  });

  test('skips malformed riffs rather than importing rubbish', async () => {
    const library = new RiffLibrary();
    const result = await library.import(JSON.stringify({
      riffs: [{ id: 'x', versions: [] }, { notes: 'nope' }],
    }));
    assert.deepEqual(result, { riffs: 0, songs: 0, skipped: 2 });
    assert.deepEqual(await library.listRiffs(), []);
  });
});
