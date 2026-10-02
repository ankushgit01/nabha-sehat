/**
 * Web storage: IndexedDB (spec §4 "web caveats").
 * expo-sqlite's web build depends on SharedArrayBuffer/COOP+COEP headers and an
 * extra WASM download; plain IndexedDB works on every static host with zero headers,
 * so it is the more robust choice for this audience. Data persists per-browser and
 * is NOT encrypted at rest (browser limitation) — surfaced in Settings.
 */
import { TABLES, TableName, SCHEMA_VERSION } from '../../db/schema';
import { createMemoryStore } from './memoryStore';
import { assertDeletable, LocalStore, matches, Query, sortAndLimit } from './LocalStore';

export function createStore(): LocalStore {
  if (typeof indexedDB === 'undefined') {
    console.warn('IndexedDB unavailable (private mode?) — using in-memory store for this session');
    return createMemoryStore();
  }
  let db: IDBDatabase | null = null;

  const req = <T>(r: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const tx = (table: TableName, mode: IDBTransactionMode) => {
    if (!db) throw new Error('LocalStore not initialised');
    return db.transaction(table, mode).objectStore(table);
  };

  return {
    encrypted: false,
    async init() {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('nabha', SCHEMA_VERSION);
        open.onupgradeneeded = () => {
          const d = open.result;
          for (const name of Object.keys(TABLES) as TableName[]) {
            if (!d.objectStoreNames.contains(name)) {
              const os = d.createObjectStore(name, { keyPath: 'id' });
              for (const ix of TABLES[name].indexes) os.createIndex(ix, ix);
            }
          }
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* best effort: ask the browser not to evict health data */
      }
    },
    async get<T>(table: TableName, id: string) {
      return (await req(tx(table, 'readonly').get(id))) as T | undefined;
    },
    async list<T>(table: TableName, q?: Query) {
      const all = (await req(tx(table, 'readonly').getAll())) as Record<string, unknown>[];
      return sortAndLimit(all.filter((r) => matches(r, q)) as T[], q);
    },
    async put(table, rec) {
      await req(tx(table, 'readwrite').put(rec));
    },
    async putMany(table, recs) {
      const os = tx(table, 'readwrite');
      await Promise.all(recs.map((r) => req(os.put(r))));
    },
    async remove(table, id) {
      assertDeletable(table);
      await req(tx(table, 'readwrite').delete(id));
    },
  };
}
