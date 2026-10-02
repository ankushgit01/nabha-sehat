/**
 * The ONE storage interface feature code depends on (spec §10: SQLite-vs-web split
 * isolated behind a single shared interface).
 *
 *   store.native.ts  → expo-sqlite (Android / iOS)
 *   store.web.ts     → IndexedDB (browsers)
 *   memoryStore.ts   → in-memory (unit tests, and last-resort fallback if IndexedDB is unavailable)
 *
 * Metro picks the platform file automatically from `./store`.
 */
import type { TableName } from '../../db/schema';

export interface Query {
  /** Equality filters, ANDed. */
  where?: Record<string, string | number | null>;
  /** Field to sort by, descending when prefixed with '-'. */
  orderBy?: string;
  limit?: number;
}

export interface LocalStore {
  init(): Promise<void>;
  get<T>(table: TableName, id: string): Promise<T | undefined>;
  list<T>(table: TableName, q?: Query): Promise<T[]>;
  /** Insert or replace by id. */
  put<T extends { id: string }>(table: TableName, rec: T): Promise<void>;
  putMany<T extends { id: string }>(table: TableName, recs: T[]): Promise<void>;
  /** Hard delete — NEVER called for sos_events (enforced in implementations). */
  remove(table: TableName, id: string): Promise<void>;
  /** Encryption at rest status, surfaced in Settings. */
  readonly encrypted: boolean;
}

export function assertDeletable(table: TableName) {
  if (table === 'sos_events') throw new Error('sos_events are append-only safety logs and cannot be deleted');
}

export function matches(rec: Record<string, unknown>, q?: Query): boolean {
  if (!q?.where) return true;
  return Object.entries(q.where).every(([k, v]) => (rec[k] ?? null) === v);
}

export function sortAndLimit<T>(rows: T[], q?: Query): T[] {
  let out = rows;
  if (q?.orderBy) {
    const desc = q.orderBy.startsWith('-');
    const key = desc ? q.orderBy.slice(1) : q.orderBy;
    out = [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[key] as string | number;
      const bv = (b as Record<string, unknown>)[key] as string | number;
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return desc ? -cmp : cmp;
    });
  }
  return q?.limit ? out.slice(0, q.limit) : out;
}
