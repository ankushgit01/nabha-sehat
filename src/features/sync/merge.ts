/**
 * Deterministic conflict resolution (spec §7). Pure functions — no I/O — so they are
 * unit-tested in tests/merge.test.ts and the SAME rules are mirrored on the server
 * in backend/src/services/syncMerge.ts.
 *
 * Rules:
 *  1. IDs are client UUIDs, so pushing a record twice is an idempotent upsert — never a duplicate.
 *  2. Default strategy is last-write-wins by SERVER timestamp: the server stamps every
 *     accepted write with a strictly increasing `server_updated_at`; the higher stamp wins.
 *  3. A local record that is still `pending` (edited offline, not yet acknowledged) is
 *     never overwritten by a pull. It is pushed first; the server decides the winner and
 *     archives the loser in `record_history`, so no write is silently lost.
 *  4. sos_events are APPEND-ONLY. They are never merged, overwritten or deleted on either
 *     side. A remote SOS with an id we already have is ignored; one we don't have is inserted.
 *  5. Consultation fields written by the doctor (SERVER_OWNED_FIELDS) always come from
 *     the server; patient-side fields follow rule 2/3.
 */
import type { Consultation, SyncRecord, SyncTable } from '../../db/types';

export const APPEND_ONLY_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>(['sos_events']);

export const SERVER_OWNED_FIELDS: Partial<Record<SyncTable, readonly string[]>> = {
  consultations: [
    'status',
    'doctor_id',
    'doctor_name',
    'notes',
    'prescription',
    'room_url',
    'started_at',
    'completed_at',
  ] satisfies (keyof Consultation)[],
};

export type PullDecision<T> =
  | { action: 'insert'; record: T }
  | { action: 'replace'; record: T }
  | { action: 'keep_local'; reason: string; record?: T };

/**
 * Decide what to do with a record pulled from the server.
 * `local` is the device copy (undefined if absent); `remote` is the server copy.
 */
export function decidePull<T extends SyncRecord>(
  table: SyncTable,
  local: T | undefined,
  remote: T,
): PullDecision<T> {
  const incoming = { ...remote, sync_status: 'synced', sync_error: null } as T;

  if (!local) return { action: 'insert', record: incoming };

  if (APPEND_ONLY_TABLES.has(table)) {
    // Never overwrite a safety log. Only adopt the server stamp so we stop re-pushing it.
    if (local.sync_status !== 'synced' && remote.server_updated_at != null) {
      return {
        action: 'keep_local',
        reason: 'append-only: acknowledged by server',
        record: { ...local, server_updated_at: remote.server_updated_at, sync_status: 'synced' } as T,
      };
    }
    return { action: 'keep_local', reason: 'append-only' };
  }

  if (local.sync_status === 'pending' || local.sync_status === 'local_only') {
    // Local edits win locally until the server has ruled on them via push.
    // Server-owned fields (e.g. a doctor's prescription) are still adopted.
    const owned = SERVER_OWNED_FIELDS[table];
    if (owned && owned.length) {
      const patched = { ...local } as Record<string, unknown>;
      for (const f of owned) patched[f] = (remote as unknown as Record<string, unknown>)[f];
      return { action: 'keep_local', reason: 'pending local edit; adopted server-owned fields', record: patched as T };
    }
    return { action: 'keep_local', reason: 'pending local edit' };
  }

  const localStamp = local.server_updated_at ?? -1;
  const remoteStamp = remote.server_updated_at ?? -1;
  if (remoteStamp > localStamp) return { action: 'replace', record: incoming };
  return { action: 'keep_local', reason: 'local copy is same or newer' };
}

export interface ServerWriteResult<T> {
  /** The record as stored on the server after the write. */
  stored: T;
  /** The record that lost, if any — archived to record_history, never discarded. */
  archived: T | null;
  outcome: 'inserted' | 'updated' | 'duplicate_ignored' | 'append_only_ignored' | 'stale_overwrote';
}

/**
 * Server-side write rule, shared with the backend. `now` must be strictly greater than
 * every previously issued stamp (the backend uses a monotonic counter seeded from Date.now()).
 */
export function applyPushOnServer<T extends SyncRecord>(
  table: SyncTable,
  existing: T | undefined,
  incoming: T,
  now: number,
  /** The server stamp the client last saw for this record (null if never synced). */
  baseStamp: number | null,
): ServerWriteResult<T> {
  if (!existing) {
    return {
      stored: { ...incoming, server_updated_at: now, sync_status: 'synced', sync_error: null } as T,
      archived: null,
      outcome: 'inserted',
    };
  }
  if (APPEND_ONLY_TABLES.has(table)) {
    return { stored: existing, archived: null, outcome: 'append_only_ignored' };
  }
  if (contentEqual(existing, incoming)) {
    return { stored: existing, archived: null, outcome: 'duplicate_ignored' };
  }

  // Client cannot change server-owned fields.
  const merged = { ...incoming } as Record<string, unknown>;
  for (const f of SERVER_OWNED_FIELDS[table] ?? []) merged[f] = (existing as unknown as Record<string, unknown>)[f];
  const stored = { ...merged, server_updated_at: now, sync_status: 'synced', sync_error: null } as unknown as T;

  const stale = baseStamp == null || (existing.server_updated_at ?? 0) > baseStamp;
  return { stored, archived: existing, outcome: stale ? 'stale_overwrote' : 'updated' };
}

const IGNORED_FOR_EQUALITY = new Set(['sync_status', 'sync_error', 'server_updated_at', 'updated_at']);

export function contentEqual(a: object, b: object): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (IGNORED_FOR_EQUALITY.has(k)) continue;
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (JSON.stringify(av ?? null) !== JSON.stringify(bv ?? null)) return false;
  }
  return true;
}
