/**
 * Audio clips for saved riffs, kept in IndexedDB.
 *
 * The rolling audio ring forgets continuously; this is the other side of that
 * bargain. When — and only when — the player saves a riff, the few seconds of
 * sound behind it are written here, so the recording is still there tomorrow.
 * Nothing else ever reaches this store, and deleting a riff deletes its clip.
 */

const DB_NAME = 'guitar-ai-coach';
const DB_VERSION = 1;
const STORE = 'clips';

export interface StoredClip {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  savedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the clip store'));
  });
}

function run<T>(store: IDBObjectStore, request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Clip store request failed'));
    store.transaction.onabort = () => reject(store.transaction.error ?? new Error('Clip store aborted'));
  });
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
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      await run(store, store.put({
        id: this.key(ref),
        // Copy: the caller's view may be part of a larger buffer.
        samples: new Float32Array(samples),
        sampleRate,
        savedAt: Date.now(),
      } satisfies StoredClip));
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
