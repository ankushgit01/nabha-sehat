/**
 * Sync engine: push pending → pull changes. Pure orchestration with injected
 * store + api so it runs identically in the app and in tests/sync.test.ts.
 *
 * Triggered by syncTriggers.ts on (a) app foreground and (b) NetInfo
 * connectivity-regained — never a polling loop (spec §7, saves data).
 */
import type { LocalStore } from '../../platform/storage/LocalStore';
import { SYNC_TABLES, SyncRecord, SyncTable } from '../../db/types';
import { decidePull } from './merge';

export interface PushItem {
  table: SyncTable;
  record: SyncRecord;
  /** Last server stamp this device saw for the record (null = never synced). */
  base: number | null;
}
export interface PushResultItem {
  table: SyncTable;
  id: string;
  status: 'ok' | 'rejected';
  stored?: SyncRecord;
  error?: string;
}
export interface PullResponse {
  changes: { table: SyncTable; records: SyncRecord[] }[];
  cursor: number;
  hasMore: boolean;
}
export interface SyncApi {
  push(items: PushItem[]): Promise<PushResultItem[]>;
  pull(since: number): Promise<PullResponse>;
  /** Uploads a local file; returns its remote URL. Optional (documents only). */
  uploadFile?(localUri: string, mime: string | null, recordId: string): Promise<string>;
}

export interface SyncReport {
  pushed: number;
  rejected: number;
  pulled: number;
  keptLocal: number;
  filesUploaded: number;
  startedAt: number;
  finishedAt: number;
  error?: string;
}

const PUSH_BATCH = 50;
const CURSOR_KEY = 'pull_cursor';
const HOLD_RELEASE_MS = 2 * 60_000;

let inFlight: Promise<SyncReport> | null = null;

/** Single-flight: concurrent triggers share one run. */
export function runSync(store: LocalStore, api: SyncApi): Promise<SyncReport> {
  if (!inFlight) {
    inFlight = doSync(store, api).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doSync(store: LocalStore, api: SyncApi): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: 0,
    rejected: 0,
    pulled: 0,
    keptLocal: 0,
    filesUploaded: 0,
    startedAt: Date.now(),
    finishedAt: 0,
  };
  try {
    // 0a. Release SOS events held during an interrupted SOS flow (app killed mid-call etc.).
    // runSync only runs for registered users, so local_only here can only mean "held".
    const held = await store.list<SyncRecord>('sos_events', { where: { sync_status: 'local_only' } });
    for (const h of held) {
      if (Date.now() - Date.parse(h.created_at) > HOLD_RELEASE_MS) {
        await store.put('sos_events', { ...h, sync_status: 'pending' });
      }
    }

    // 0b. Upload attached files first so pushed records carry their remote URL.
    if (api.uploadFile) {
      const docs = await store.list<SyncRecord & { file_uri: string | null; file_remote_url: string | null; mime_type: string | null }>(
        'health_records',
        { where: { sync_status: 'pending' } },
      );
      for (const d of docs) {
        if (d.file_uri && !d.file_remote_url) {
          const url = await api.uploadFile(d.file_uri, d.mime_type, d.id);
          await store.put('health_records', { ...d, file_remote_url: url });
          report.filesUploaded++;
        }
      }
    }

    // 1. PUSH everything pending. SOS first: safety logs get priority on flaky links.
    const order: SyncTable[] = ['sos_events', ...SYNC_TABLES.filter((t) => t !== 'sos_events')];
    const pending: PushItem[] = [];
    for (const table of order) {
      const rows = await store.list<SyncRecord>(table, { where: { sync_status: 'pending' }, orderBy: 'created_at' });
      for (const r of rows) pending.push({ table, record: r, base: r.server_updated_at });
    }
    for (let i = 0; i < pending.length; i += PUSH_BATCH) {
      const batch = pending.slice(i, i + PUSH_BATCH);
      const results = await api.push(batch);
      for (const res of results) {
        const sent = batch.find((b) => b.record.id === res.id && b.table === res.table);
        const current = await store.get<SyncRecord>(res.table, res.id);
        if (!sent || !current) continue;
        if (res.status === 'ok' && res.stored) {
          if (current.updated_at !== sent.record.updated_at) {
            // Edited again while in flight: keep the newer local edit pending, but record the ack stamp.
            await store.put(res.table, { ...current, server_updated_at: res.stored.server_updated_at });
          } else {
            await store.put(res.table, { ...res.stored, sync_status: 'synced', sync_error: null });
          }
          report.pushed++;
        } else {
          await store.put(res.table, { ...current, sync_status: 'conflict', sync_error: res.error ?? 'rejected' });
          report.rejected++;
        }
      }
    }

    // 2. PULL server-side changes (e.g. a doctor's reply to a queued consultation).
    const cursorRow = await store.get<{ id: string; value: string }>('meta', CURSOR_KEY);
    let cursor = cursorRow ? Number(cursorRow.value) : 0;
    for (let page = 0; page < 20; page++) {
      const resp = await api.pull(cursor);
      for (const { table, records } of resp.changes) {
        for (const remote of records) {
          const local = await store.get<SyncRecord>(table, remote.id);
          const decision = decidePull(table, local, remote);
          if (decision.action === 'keep_local') {
            report.keptLocal++;
            if (decision.record) await store.put(table, decision.record);
          } else {
            await store.put(table, decision.record);
            report.pulled++;
          }
        }
      }
      cursor = resp.cursor;
      await store.put('meta', { id: CURSOR_KEY, value: String(cursor) });
      if (!resp.hasMore) break;
    }
  } catch (e) {
    // Network failures are normal here; everything stays pending and retries on next trigger.
    report.error = e instanceof Error ? e.message : String(e);
  }
  report.finishedAt = Date.now();
  return report;
}

/** When an anonymous user registers, promote their local-only records so they sync. */
export async function promoteLocalOnly(store: LocalStore, newUserId: string): Promise<number> {
  let n = 0;
  for (const table of SYNC_TABLES) {
    const rows = await store.list<SyncRecord>(table, { where: { sync_status: 'local_only' } });
    for (const r of rows) {
      await store.put(table, { ...r, user_id: newUserId, sync_status: 'pending' });
      n++;
    }
  }
  return n;
}
