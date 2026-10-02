/**
 * Server half of the sync protocol. The merge RULES are imported from the app's
 * src/features/sync/merge.ts so client and server can never disagree.
 */
import type { Db } from 'mongodb';
import { applyPushOnServer } from '../../../src/features/sync/merge';
import type { SyncRecord, SyncTable } from '../../../src/db/types';
import { nextStamp } from './clock';
import { notifySosToFacility } from './notify';

export const SYNC_TABLES: SyncTable[] = ['symptom_logs', 'consultations', 'sos_events', 'health_records'];

type Doc = Omit<SyncRecord, 'id'> & { _id: string };
const toDoc = (r: SyncRecord): Doc => {
  const { id, ...rest } = r;
  return { _id: id, ...rest } as Doc;
};
const fromDoc = (d: Doc): SyncRecord => {
  const { _id, ...rest } = d;
  return { id: _id, ...rest } as unknown as SyncRecord;
};

export interface PushInput {
  table: SyncTable;
  record: SyncRecord;
  base: number | null;
}

export async function pushRecords(db: Db, userId: string, items: PushInput[]) {
  const results = [];
  for (const { table, record, base } of items) {
    if (!SYNC_TABLES.includes(table)) {
      results.push({ table, id: record.id, status: 'rejected' as const, error: 'unknown table' });
      continue;
    }
    if (record.user_id !== userId) {
      results.push({ table, id: record.id, status: 'rejected' as const, error: 'record belongs to another user' });
      continue;
    }
    const col = db.collection<Doc>(table);
    const existingDoc = await col.findOne({ _id: record.id });
    if (existingDoc && existingDoc.user_id !== userId) {
      results.push({ table, id: record.id, status: 'rejected' as const, error: 'id collision' });
      continue;
    }
    const existing = existingDoc ? fromDoc(existingDoc) : undefined;
    const stamp = await nextStamp(db);
    const r = applyPushOnServer(table, existing, record, stamp, base);

    if (r.outcome === 'inserted' && table === 'consultations') {
      // `status` is server-owned: a newly received request enters the doctors' queue.
      const c = r.stored as unknown as { status: string; doctor_id: null; notes: null; prescription: null };
      c.status = 'waiting';
      c.doctor_id = null;
      c.notes = null;
      c.prescription = null;
    }
    if (r.outcome === 'inserted') {
      // insertOne + duplicate-key tolerance makes concurrent double-pushes idempotent.
      try {
        await col.insertOne(toDoc(r.stored));
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
      if (table === 'sos_events') void notifySosToFacility(r.stored as never);
    } else if (r.outcome === 'updated' || r.outcome === 'stale_overwrote') {
      await db.collection('record_history').insertOne({
        table,
        record_id: record.id,
        archived_at: stamp,
        reason: r.outcome,
        record: r.archived,
      });
      await col.replaceOne({ _id: record.id }, toDoc(r.stored));
    }
    results.push({ table, id: record.id, status: 'ok' as const, stored: r.stored });
  }
  return results;
}

export async function pullChanges(db: Db, userId: string, since: number, limit = 200) {
  const changes: { table: SyncTable; records: SyncRecord[] }[] = [];
  let cursor = since;
  let hasMore = false;
  for (const table of SYNC_TABLES) {
    const docs = await db
      .collection<Doc>(table)
      .find({ user_id: userId, server_updated_at: { $gt: since } })
      .sort({ server_updated_at: 1 })
      .limit(limit + 1)
      .toArray();
    if (docs.length > limit) {
      hasMore = true;
      docs.pop();
    }
    if (docs.length) {
      changes.push({ table, records: docs.map(fromDoc) });
      cursor = Math.max(cursor, ...docs.map((d) => d.server_updated_at ?? 0));
    }
  }
  // When paging, only advance to the smallest table's last stamp so nothing is skipped.
  if (hasMore) {
    cursor = Math.min(
      ...changes.map((c) => Math.max(...c.records.map((r) => r.server_updated_at ?? 0))),
    );
  }
  return { changes, cursor, hasMore };
}
