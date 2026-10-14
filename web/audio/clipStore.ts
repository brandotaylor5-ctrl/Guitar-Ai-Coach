/**
 * Audio clips for saved riffs, kept in IndexedDB.
 *
 * The rolling audio ring forgets continuously; this is the other side of that
 * bargain. When — and only when — the player saves a riff, the few seconds of
 * sound behind it are written here, so the recording is still there tomorrow.
 * Nothing else ever reaches this store, and deleting a riff deletes its clip.
 */

import { openWorkbenchDatabase, inTransaction, requestValue, transactionDone } from '../workbench/database.ts';
import { validatePcm } from '../../src/workbench/regions.ts';
import type { Riff } from '../../src/types.ts';
const STORE = 'clips';

export interface StoredClip {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  savedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return openWorkbenchDatabase(indexedDB);
}

async function run<T>(store: IDBObjectStore, request: IDBRequest<T>): Promise<T> {
  const done = transactionDone(store.transaction);
  const [value] = await Promise.all([requestValue(request), done]);
  return value;
}

/**
 * Every method resolves to a sensible empty value rather than throwing: audio
 * is a bonus on top of a riff, and losing it must never take the riff with it.
 */
export class ClipStore {
  private db: Promise<IDBDatabase> | null = null;

  private connect(): Promise<IDBDatabase> {
    if (!this.db) this.db = openDatabase();
    return this.db;
  }

  get available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  /** Strip any `clip:` prefix so callers can pass an audioRef straight through. */
  private key(ref: string): string {
    return ref.replace(/^clip:/, '');
  }

  async put(ref: string, samples: Float32Array, sampleRate: number): Promise<boolean> {
    if (!this.available) return false;
    try {
      const db = await this.connect();
      validatePcm({ sampleRate, channels: [samples] });
      await inTransaction(db, [STORE, 'assets', 'chunks', 'riffs'], 'readwrite', async tx => {
        const key = this.key(ref);
        const existing = await requestValue(tx.objectStore(STORE).get(key));
        const clip: StoredClip = existing ?? { id:key, samples:new Float32Array(samples), sampleRate, savedAt:Date.now() };
        if (!existing) await requestValue(tx.objectStore(STORE).add(clip));
        const id = `legacy:${clip.id}:${clip.savedAt}`;
        if (!(await requestValue(tx.objectStore('assets').get(id)))) {
          await requestValue(tx.objectStore('assets').add({ id, source:'legacy', state:'complete', sampleRate:clip.sampleRate, channelCount:1, sampleCount:clip.samples.length, createdAt:clip.savedAt, markers:[] }));
          await requestValue(tx.objectStore('chunks').add({ assetId:id, index:0, startSample:0, channels:[clip.samples] }));
        }
        const riffs:Riff[]=await requestValue(tx.objectStore('riffs').getAll());
        for(const riff of riffs){let changed=false;for(const version of riff.versions)if(version.audioRef?.replace(/^clip:/,'')===key&&!version.recording){version.recording={assetId:id,startSample:0,endSample:clip.samples.length};version.sourceKind='recorded';version.analysis={state:version.notes.length?'estimated':'unavailable'};changed=true;}
          if(changed){riff.revision=(riff.revision??0)+1;await requestValue(tx.objectStore('riffs').put(riff));}}
      });
      return true;
    } catch {
      return false;
    }
  }

  async get(ref: string): Promise<StoredClip | null> {
    if (!this.available) return null;
    try {
      const db = await this.connect();
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      return (await run(store, store.get(this.key(ref)))) ?? null;
    } catch {
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    if (!this.available) return;
    try {
      const db = await this.connect();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      await run(store, store.delete(this.key(ref)));
    } catch {
      // Nothing to do: a clip that cannot be deleted is not worth failing over.
    }
  }

  /** Remove every clip belonging to a riff being deleted. */
  async deleteAll(refs: Array<string | undefined>): Promise<void> {
    for (const ref of refs) if (ref) await this.delete(ref);
  }
}
