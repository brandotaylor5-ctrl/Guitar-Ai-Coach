/**
 * A Riff Library that survives closing the browser tab.
 *
 * Riffs are structured notes, not audio, so a whole library is a few kilobytes
 * and fits comfortably in local storage. Audio clips deliberately do not live
 * here: they are large, and keeping them by default would undo the promise that
 * the app forgets what you did not save.
 */

import type { Riff, SongSeed } from '../types.ts';
import type { RiffStore } from './store.ts';

/** The slice of the Web Storage API this needs, so it can be tested anywhere. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LibraryData {
  version: 1;
  riffs: Riff[];
  songs: SongSeed[];
}

export const DEFAULT_STORAGE_KEY = 'guitar-ai-coach.library.v1';

export class LocalStorageRiffStore implements RiffStore {
  private readonly storage: StorageLike;
  private readonly key: string;

  constructor(storage: StorageLike, key: string = DEFAULT_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  private read(): LibraryData {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { version: 1, riffs: [], songs: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<LibraryData>;
      return { version: 1, riffs: parsed.riffs ?? [], songs: parsed.songs ?? [] };
    } catch {
      // Corrupt storage should not brick the app. Start clean rather than
      // throwing on every read; the old value stays put until something saves.
      return { version: 1, riffs: [], songs: [] };
    }
  }

  private write(data: LibraryData): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      throw new Error(
        'Could not save to browser storage — it may be full or disabled. ' +
        `Your riffs are still in this session. (${(err as Error).message})`,
      );
    }
  }

  async listRiffs(): Promise<Riff[]> {
    return this.read().riffs.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getRiff(id: string): Promise<Riff | null> {
    return this.read().riffs.find((r) => r.id === id) ?? null;
  }

  async putRiff(riff: Riff): Promise<void> {
    const data = this.read();
    const index = data.riffs.findIndex((r) => r.id === riff.id);
    if (index >= 0) data.riffs[index] = riff;
    else data.riffs.push(riff);
    this.write(data);
  }

  async deleteRiff(id: string): Promise<void> {
    const data = this.read();
    data.riffs = data.riffs.filter((r) => r.id !== id);
    this.write(data);
  }

  async listSongs(): Promise<SongSeed[]> {
    return this.read().songs.sort((a, b) => a.createdAt - b.createdAt);
  }

  async putSong(song: SongSeed): Promise<void> {
    const data = this.read();
    const index = data.songs.findIndex((s) => s.id === song.id);
    if (index >= 0) data.songs[index] = song;
    else data.songs.push(song);
    this.write(data);
  }

  async deleteSong(id: string): Promise<void> {
    const data = this.read();
    data.songs = data.songs.filter((s) => s.id !== id);
    this.write(data);
  }

  /** Everything, as JSON. The player's ideas should never be locked in. */
  export(): string {
    return JSON.stringify(this.read(), null, 2);
  }

  /** Merge an exported library in, keeping both sides where ids collide. */
  import(json: string): { added: number; skipped: number } {
    const incoming = JSON.parse(json) as Partial<LibraryData>;
    const data = this.read();
    const existing = new Set(data.riffs.map((r) => r.id));
    let added = 0;
    let skipped = 0;
    for (const riff of incoming.riffs ?? []) {
      if (existing.has(riff.id)) { skipped++; continue; }
      data.riffs.push(riff);
      added++;
    }
    for (const song of incoming.songs ?? []) {
      if (!data.songs.some((s) => s.id === song.id)) data.songs.push(song);
    }
    this.write(data);
    return { added, skipped };
  }
}
