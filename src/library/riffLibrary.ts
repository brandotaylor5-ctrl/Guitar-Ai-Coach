/**
 * The Riff Library: a library of the player's own ideas.
 *
 * The governing rule is that a riff is never overwritten. Playing an idea
 * differently creates a new version hanging off the one it grew from, so the
 * library is a branching history of how an idea developed — version control
 * for music — rather than a single mutable "latest".
 */

import type { NoteEvent, RecognitionMatch, Riff, RiffVersion, SongSeed } from '../types.ts';
import { makeId } from '../util/id.ts';
import { compareNotes } from '../phrase/similarity.ts';
import { combineTakes } from '../phrase/edit.ts';
import { cleanestIndex } from '../phrase/quality.ts';
import { InMemoryRiffStore } from './store.ts';
import type { RiffStore } from './store.ts';

/** A, B, ... Z, AA, AB, ... so version labels never run out. */
export function versionLabel(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Version ${out}`;
}

export interface SaveRiffOptions {
  name?: string | null;
  audioRef?: string;
  comment?: string;
  tags?: string[];
  createdAt?: number;
}

export interface AddVersionOptions {
  /** Which version this one grew out of. Defaults to the current version. */
  parentId?: string;
  audioRef?: string;
  comment?: string;
  createdAt?: number;
  /** Make this the version the riff opens on. Defaults to true. */
  makeCurrent?: boolean;
}

export interface RecognitionOptions {
  /** Minimum similarity to report a match. */
  threshold?: number;
  limit?: number;
  /** Skip this riff when checking — usually the one being played right now. */
  excludeRiffId?: string;
}

/** A node in a riff's version history. */
export interface VersionNode {
  version: RiffVersion;
  children: VersionNode[];
}

export class RiffLibrary {
  private readonly store: RiffStore;

  constructor(store: RiffStore = new InMemoryRiffStore()) {
    this.store = store;
  }

  /** SAVE RIFF. The idea becomes Version A; nothing is ever lost after this. */
  async saveRiff(notes: NoteEvent[], options: SaveRiffOptions = {}): Promise<Riff> {
    if (notes.length === 0) throw new Error('Cannot save a riff with no notes');
    const now = options.createdAt ?? Date.now();
    const version: RiffVersion = {
      id: makeId('ver'),
      label: versionLabel(0),
      parentId: null,
      notes: [...notes],
      createdAt: now,
      ...(options.audioRef ? { audioRef: options.audioRef } : {}),
      ...(options.comment ? { comment: options.comment } : {}),
    };
    const riff: Riff = {
      id: makeId('riff'),
      name: options.name ?? null,
      createdAt: now,
      updatedAt: now,
      versions: [version],
      currentVersionId: version.id,
      tags: options.tags ?? [],
    };
    await this.store.putRiff(riff);
    return riff;
  }

  async getRiff(id: string): Promise<Riff | null> {
    return this.store.getRiff(id);
  }

  async listRiffs(): Promise<Riff[]> {
    return this.store.listRiffs();
  }

  async deleteRiff(id: string): Promise<void> {
    await this.store.deleteRiff(id);
  }

  private async mustGet(id: string): Promise<Riff> {
    const riff = await this.store.getRiff(id);
    if (!riff) throw new Error(`No riff with id ${id}`);
    return riff;
  }

  async rename(id: string, name: string | null): Promise<Riff> {
    const riff = await this.mustGet(id);
    const updated: Riff = { ...riff, name, updatedAt: Date.now() };
    await this.store.putRiff(updated);
    return updated;
  }

  async annotate(id: string, notes: string): Promise<Riff> {
    const riff = await this.mustGet(id);
    const updated: Riff = { ...riff, notes, updatedAt: Date.now() };
    await this.store.putRiff(updated);
    return updated;
  }

  /** A new take becomes a branch, not a replacement. */
  async addVersion(riffId: string, notes: NoteEvent[], options: AddVersionOptions = {}): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    const parentId = options.parentId ?? riff.currentVersionId;
    if (!riff.versions.some((v) => v.id === parentId)) {
      throw new Error(`No version ${parentId} on riff ${riffId}`);
    }
    const version: RiffVersion = {
      id: makeId('ver'),
      label: versionLabel(riff.versions.length),
      parentId,
      notes: [...notes],
      createdAt: options.createdAt ?? Date.now(),
      ...(options.audioRef ? { audioRef: options.audioRef } : {}),
      ...(options.comment ? { comment: options.comment } : {}),
    };
    const updated: Riff = {
      ...riff,
      versions: [...riff.versions, version],
      currentVersionId: options.makeCurrent === false ? riff.currentVersionId : version.id,
      updatedAt: version.createdAt,
    };
    await this.store.putRiff(updated);
    return version;
  }

  async getVersion(riffId: string, versionId: string): Promise<RiffVersion | null> {
    const riff = await this.mustGet(riffId);
    return riff.versions.find((v) => v.id === versionId) ?? null;
  }

  async currentVersion(riffId: string): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    const version = riff.versions.find((v) => v.id === riff.currentVersionId);
    if (!version) throw new Error(`Riff ${riffId} has no current version`);
    return version;
  }

  /** "Keep B" — change which version the riff opens on, discarding nothing. */
  async setCurrentVersion(riffId: string, versionId: string): Promise<Riff> {
    const riff = await this.mustGet(riffId);
    if (!riff.versions.some((v) => v.id === versionId)) {
      throw new Error(`No version ${versionId} on riff ${riffId}`);
    }
    const updated: Riff = { ...riff, currentVersionId: versionId, updatedAt: Date.now() };
    await this.store.putRiff(updated);
    return updated;
  }

  /** The version that plays cleanest, which may not be the newest. */
  async bestTake(riffId: string): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    return riff.versions[cleanestIndex(riff.versions.map((v) => v.notes))]!;
  }

  async originalVersion(riffId: string): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    return riff.versions.find((v) => v.parentId === null) ?? riff.versions[0]!;
  }

  async latestVersion(riffId: string): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    return riff.versions.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a));
  }

  /** "Combine them" — the opening of one version, the ending of another. */
  async combineVersions(
    riffId: string,
    aVersionId: string,
    bVersionId: string,
    splitRatio = 0.5,
  ): Promise<RiffVersion> {
    const riff = await this.mustGet(riffId);
    const a = riff.versions.find((v) => v.id === aVersionId);
    const b = riff.versions.find((v) => v.id === bVersionId);
    if (!a || !b) throw new Error('Both versions must exist on the riff');
    return this.addVersion(riffId, combineTakes(a.notes, b.notes, splitRatio), {
      parentId: aVersionId,
      comment: `Opening of ${a.label}, ending of ${b.label}`,
    });
  }

  /** The branch structure, for drawing the history of an idea. */
  async versionTree(riffId: string): Promise<VersionNode[]> {
    const riff = await this.mustGet(riffId);
    const nodes = new Map<string, VersionNode>(
      riff.versions.map((v) => [v.id, { version: v, children: [] }]),
    );
    const roots: VersionNode[] = [];
    for (const version of riff.versions) {
      const node = nodes.get(version.id)!;
      const parent = version.parentId ? nodes.get(version.parentId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /**
   * "You just played something very similar to Riff 14 from three weeks ago."
   * Checks every version of every riff, since an idea may match an old branch
   * the player abandoned rather than the one they kept.
   */
  async findSimilar(notes: NoteEvent[], options: RecognitionOptions = {}): Promise<RecognitionMatch[]> {
    const threshold = options.threshold ?? 0.85;
    const limit = options.limit ?? 5;
    const riffs = await this.store.listRiffs();
    const matches: RecognitionMatch[] = [];

    for (const riff of riffs) {
      if (riff.id === options.excludeRiffId) continue;
      let best: RecognitionMatch | null = null;
      for (const version of riff.versions) {
        const score = compareNotes(version.notes, notes).overall;
        if (score >= threshold && (!best || score > best.similarity)) {
          best = {
            riffId: riff.id,
            versionId: version.id,
            riffName: riff.name,
            similarity: score,
            createdAt: version.createdAt,
          };
        }
      }
      if (best) matches.push(best);
    }

    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  // --- Song seeds -----------------------------------------------------------

  async createSong(name: string, sections: SongSeed['sections'] = []): Promise<SongSeed> {
    const song: SongSeed = { id: makeId('song'), name, createdAt: Date.now(), sections };
    await this.store.putSong(song);
    return song;
  }

  async listSongs(): Promise<SongSeed[]> {
    return this.store.listSongs();
  }

  async addToSong(songId: string, role: string, riffId: string, versionId?: string): Promise<SongSeed> {
    const songs = await this.store.listSongs();
    const song = songs.find((s) => s.id === songId);
    if (!song) throw new Error(`No song with id ${songId}`);
    const updated: SongSeed = {
      ...song,
      sections: [...song.sections, { role, riffId, ...(versionId ? { versionId } : {}) }],
    };
    await this.store.putSong(updated);
    return updated;
  }

  /**
   * Riffs that might belong in the same song, because they share a tonal
   * centre and material. Suggestion only — grouping is the player's call.
   */
  async relatedRiffs(riffId: string, threshold = 0.6): Promise<Array<{ riff: Riff; similarity: number }>> {
    const target = await this.mustGet(riffId);
    const targetNotes = target.versions.find((v) => v.id === target.currentVersionId)!.notes;
    const riffs = await this.store.listRiffs();
    return riffs
      .filter((r) => r.id !== riffId)
      .map((riff) => {
        const similarity = Math.max(
          ...riff.versions.map((v) => compareNotes(v.notes, targetNotes).overall),
        );
        return { riff, similarity };
      })
      .filter((r) => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }
}
