/**
 * A JSON-file store, so a library survives closing the app.
 *
 * Node-only: imported separately from `store.ts` so that browser bundles never
 * pull `node:fs` in. Riffs are small — structured notes, not audio — so one
 * file per library is honest until someone has thousands of them.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Riff, SongSeed } from '../types.ts';
import type { RiffStore } from './store.ts';

interface LibraryFile {
  version: 1;
  riffs: Riff[];
  songs: SongSeed[];
}

/**
 * A factory, not a shared constant: spreading one shared object would hand
 * every empty library the *same* arrays, and riffs saved to one would appear
 * in all the others.
 */
function emptyLibrary(): LibraryFile {
  return { version: 1, riffs: [], songs: [] };
}

export class JsonFileRiffStore implements RiffStore {
  private cache: LibraryFile | null = null;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private async load(): Promise<LibraryFile> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LibraryFile>;
      this.cache = { version: 1, riffs: parsed.riffs ?? [], songs: parsed.songs ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.cache = emptyLibrary();
    }
    return this.cache;
  }

  private async save(): Promise<void> {
    const data = await this.load();
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  async listRiffs(): Promise<Riff[]> {
    return [...(await this.load()).riffs].sort((a, b) => a.createdAt - b.createdAt);
  }

  async getRiff(id: string): Promise<Riff | null> {
    return (await this.load()).riffs.find((r) => r.id === id) ?? null;
  }

  async putRiff(riff: Riff): Promise<void> {
    const data = await this.load();
    const i = data.riffs.findIndex((r) => r.id === riff.id);
    if (i >= 0) data.riffs[i] = riff;
    else data.riffs.push(riff);
    await this.save();
  }

  async deleteRiff(id: string): Promise<void> {
    const data = await this.load();
    data.riffs = data.riffs.filter((r) => r.id !== id);
    await this.save();
  }

  async listSongs(): Promise<SongSeed[]> {
    return [...(await this.load()).songs].sort((a, b) => a.createdAt - b.createdAt);
  }

  async putSong(song: SongSeed): Promise<void> {
    const data = await this.load();
    const i = data.songs.findIndex((s) => s.id === song.id);
    if (i >= 0) data.songs[i] = song;
    else data.songs.push(song);
    await this.save();
  }

  async deleteSong(id: string): Promise<void> {
    const data = await this.load();
    data.songs = data.songs.filter((s) => s.id !== id);
    await this.save();
  }
}
