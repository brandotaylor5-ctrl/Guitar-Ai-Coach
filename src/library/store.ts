/** Persistence boundary for the Riff Library. */

import type { Riff, SongSeed } from '../types.ts';

export interface RiffStore {
  listRiffs(): Promise<Riff[]>;
  getRiff(id: string): Promise<Riff | null>;
  putRiff(riff: Riff): Promise<void>;
  deleteRiff(id: string): Promise<void>;
  listSongs(): Promise<SongSeed[]>;
  putSong(song: SongSeed): Promise<void>;
  deleteSong(id: string): Promise<void>;
}

/** The default store. Fine for a session; loses everything on reload. */
export class InMemoryRiffStore implements RiffStore {
  private riffs = new Map<string, Riff>();
  private songs = new Map<string, SongSeed>();

  async listRiffs(): Promise<Riff[]> {
    return [...this.riffs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  async getRiff(id: string): Promise<Riff | null> {
    return this.riffs.get(id) ?? null;
  }

  async putRiff(riff: Riff): Promise<void> {
    this.riffs.set(riff.id, riff);
  }

  async deleteRiff(id: string): Promise<void> {
    this.riffs.delete(id);
  }

  async listSongs(): Promise<SongSeed[]> {
    return [...this.songs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  async putSong(song: SongSeed): Promise<void> {
    this.songs.set(song.id, song);
  }

  async deleteSong(id: string): Promise<void> {
    this.songs.delete(id);
  }
}
