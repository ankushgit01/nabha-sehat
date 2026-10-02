import type { TableName } from '../../db/schema';
import { assertDeletable, LocalStore, matches, Query, sortAndLimit } from './LocalStore';

export function createMemoryStore(): LocalStore {
  const tables = new Map<string, Map<string, unknown>>();
  const t = (name: string) => {
    let m = tables.get(name);
    if (!m) tables.set(name, (m = new Map()));
    return m;
  };
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    encrypted: false,
    async init() {},
    async get<T>(table: TableName, id: string) {
      const v = t(table).get(id);
      return v === undefined ? undefined : clone(v as T);
    },
    async list<T>(table: TableName, q?: Query) {
      const rows = [...t(table).values()].filter((r) => matches(r as Record<string, unknown>, q));
      return sortAndLimit(clone(rows) as T[], q);
    },
    async put(table, rec) {
      t(table).set(rec.id, clone(rec));
    },
    async putMany(table, recs) {
      for (const r of recs) t(table).set(r.id, clone(r));
    },
    async remove(table, id) {
      assertDeletable(table);
      t(table).delete(id);
    },
  };
}
