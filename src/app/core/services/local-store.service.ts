import { Injectable } from '@angular/core';

const DB_NAME = 'WeddingDB';
const DB_VERSION = 1;
const STORE = 'data';

/**
 * Thin promise wrapper over a single-object-store IndexedDB database.
 *
 * The guest list has to survive a page reload — and a laptop lid closing —
 * even when the venue's WiFi drops, so every write goes here before it is
 * pushed to the server.
 */
@Injectable({ providedIn: 'root' })
export class LocalStoreService {
  private connection: Promise<IDBDatabase> | null = null;

  async read<T>(key: string, fallback: T): Promise<T> {
    const db = await this.open();
    const raw = await request<{ key: string; value: string } | undefined>(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(key),
    );
    if (!raw) return fallback;
    try {
      return JSON.parse(raw.value) as T;
    } catch {
      return fallback;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    await request(tx.objectStore(STORE).put({ key, value: JSON.stringify(value) }));
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB non supporté par ce navigateur'));
        return;
      }
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet'));
      open.onsuccess = () => resolve(open.result);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) {
          open.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
    });
    // A failed connection must not be cached, or every later call inherits it.
    this.connection.catch(() => (this.connection = null));
    return this.connection;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
