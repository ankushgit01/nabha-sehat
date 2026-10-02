/**
 * Offline → online sync matrix (spec §8 milestone "Harden"):
 * create offline → go online → verify no loss/duplication; conflicting edits → verify
 * deterministic resolution; SOS never overwritten. Uses the real sync engine + merge
 * rules against an in-memory fake server that implements the backend's write rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryStore } from '../src/platform/storage/memoryStore';
import { createRepository } from '../src/features/sync/repository';
import { runSync, SyncApi, PushItem, promoteLocalOnly } from '../src/features/sync/syncEngine';
import { applyPushOnServer, decidePull } from '../src/features/sync/merge';
import type { Consultation, SosEvent, SyncRecord, SyncTable } from '../src/db/types';

function fakeServer() {
  const db = new Map<string, SyncRecord & { _table: SyncTable }>();
  const history: SyncRecord[] = [];
  let clock = 1_000;
  let online = true;
  const pushCalls: PushItem[][] = [];
  const api: SyncApi = {
    async push(items) {
      if (!online) throw new Error('Network Error');
      pushCalls.push(items);
      return items.map(({ table, record, base }) => {
        const key = `${table}/${record.id}`;
        const existing = db.get(key);
        const r = applyPushOnServer(table, existing, record, ++clock, base);
        if (r.archived) history.push(r.archived);
        db.set(key, { ...r.stored, _table: table });
        return { table, id: record.id, status: 'ok' as const, stored: r.stored };
      });
    },
    async pull(since) {
      if (!online) throw new Error('Network Error');
      const changes = new Map<SyncTable, SyncRecord[]>();
      for (const rec of db.values()) {
        if ((rec.server_updated_at ?? 0) > since) {
          const { _table, ...r } = rec;
          changes.set(_table, [...(changes.get(_table) ?? []), r as SyncRecord]);
        }
      }
      return { changes: [...changes].map(([table, records]) => ({ table, records })), cursor: clock, hasMore: false };
    },
  };
  return {
    api,
    db,
    history,
    pushCalls,
    setOnline: (v: boolean) => (online = v),
    serverEdit(table: SyncTable, id: string, patch: Partial<SyncRecord> & Record<string, unknown>) {
      const key = `${table}/${id}`;
      const cur = db.get(key)!;
      db.set(key, { ...cur, ...patch, server_updated_at: ++clock } as SyncRecord & { _table: SyncTable });
    },
  };
}

function setup(registered = true) {
  const store = createMemoryStore();
  const repo = createRepository({ store, newId: randomUUID, identity: () => ({ userId: 'u1', registered }) });
  return { store, repo };
}

const consult = (): Omit<Consultation, keyof import('../src/db/types').SyncMeta> => ({
  symptom_log_id: null,
  mode: 'chat',
  status: 'queued',
  patient_note: 'fever 3 days',
  doctor_id: null,
  doctor_name: null,
  notes: null,
  prescription: null,
  room_url: null,
  started_at: null,
  completed_at: null,
});

const sos = (): Omit<SosEvent, keyof import('../src/db/types').SyncMeta> => ({
  latitude: 30.37,
  longitude: 76.15,
  location_accuracy_m: 20,
  location_error: null,
  reported_symptom: 'snake_bite',
  contacted_numbers: ['108'],
  sms_status: 'sent',
  call_status: 'dialled',
});

test('records created offline sync once, with no loss and no duplicates', async () => {
  const { store, repo } = setup();
  const srv = fakeServer();
  srv.setOnline(false);
  const c = await repo.create('consultations', consult());
  const s = await repo.create('sos_events', sos());
  const r1 = await runSync(store, srv.api);
  assert.ok(r1.error, 'offline sync reports an error but does not throw');
  assert.equal((await store.get<Consultation>('consultations', c.id))!.sync_status, 'pending');

  srv.setOnline(true);
  await runSync(store, srv.api);
  await runSync(store, srv.api); // second run must be a no-op
  assert.equal(srv.db.size, 2);
  assert.equal((await store.get<Consultation>('consultations', c.id))!.sync_status, 'synced');
  assert.equal((await store.get<SosEvent>('sos_events', s.id))!.sync_status, 'synced');
  assert.equal(srv.pushCalls.flat().length, 2, 'each record pushed exactly once');
  assert.equal(srv.pushCalls[0]![0]!.table, 'sos_events', 'SOS is pushed first');
});

test('re-pushing the same record (lost ACK) does not duplicate', async () => {
  const { store, repo } = setup();
  const srv = fakeServer();
  const c = await repo.create('consultations', consult());
  await runSync(store, srv.api);
  // Simulate lost acknowledgement: device thinks it's still pending.
  const cur = (await store.get<Consultation>('consultations', c.id))!;
  await store.put('consultations', { ...cur, sync_status: 'pending', server_updated_at: null });
  await runSync(store, srv.api);
  assert.equal(srv.db.size, 1);
});

test("doctor's reply to a queued consultation is pulled down", async () => {
  const { store, repo } = setup();
  const srv = fakeServer();
  const c = await repo.create('consultations', consult());
  await runSync(store, srv.api);
  srv.serverEdit('consultations', c.id, { status: 'completed', notes: 'Paracetamol, fluids', doctor_name: 'Dr. K' });
  await runSync(store, srv.api);
  const local = (await store.get<Consultation>('consultations', c.id))!;
  assert.equal(local.status, 'completed');
  assert.equal(local.notes, 'Paracetamol, fluids');
});

test('conflicting edits resolve deterministically and the loser is archived', async () => {
  const { store, repo } = setup();
  const srv = fakeServer();
  const c = await repo.create('consultations', consult());
  await runSync(store, srv.api);
  // Server-side edit to a patient field (e.g. from another device)…
  srv.serverEdit('consultations', c.id, { patient_note: 'edited on web' });
  // …while this device edits offline.
  await repo.update('consultations', c.id, { patient_note: 'edited on phone' });
  await runSync(store, srv.api);
  // Phone write reached the server last → wins (LWW by server stamp). Web edit is archived, not lost.
  const server = srv.db.get(`consultations/${c.id}`) as unknown as Consultation;
  assert.equal(server.patient_note, 'edited on phone');
  assert.ok(srv.history.some((h) => (h as Consultation).patient_note === 'edited on web'));
  assert.equal((await store.get<Consultation>('consultations', c.id))!.patient_note, 'edited on phone');
});

test('client cannot overwrite doctor-owned fields, even with a stale copy', async () => {
  const { store, repo } = setup();
  const srv = fakeServer();
  const c = await repo.create('consultations', consult());
  await runSync(store, srv.api);
  srv.serverEdit('consultations', c.id, { prescription: 'ORS', status: 'completed' });
  await repo.update('consultations', c.id, { patient_note: 'feeling better' });
  await runSync(store, srv.api);
  const local = (await store.get<Consultation>('consultations', c.id))!;
  assert.equal(local.prescription, 'ORS');
  assert.equal(local.status, 'completed');
  assert.equal(local.patient_note, 'feeling better');
});

test('SOS events are append-only: never overwritten or deleted', async () => {
  const { store, repo } = setup();
  const s = await repo.create('sos_events', sos());
  await assert.rejects(store.remove('sos_events', s.id));
  await assert.rejects(repo.update('sos_events', s.id, { reported_symptom: 'x' } as never));
  const tampered = { ...s, reported_symptom: 'tampered', server_updated_at: 99999 } as SosEvent;
  const d = decidePull('sos_events', { ...s, sync_status: 'synced', server_updated_at: 1 }, tampered);
  assert.equal(d.action, 'keep_local');
  const w = applyPushOnServer('sos_events', { ...s, server_updated_at: 5 }, tampered, 10, 5);
  assert.equal(w.outcome, 'append_only_ignored');
});

test('anonymous records stay local until the user registers', async () => {
  const { store, repo } = setup(false);
  const srv = fakeServer();
  await repo.create('sos_events', sos());
  await runSync(store, srv.api);
  assert.equal(srv.db.size, 0);
  assert.equal(await promoteLocalOnly(store, 'u-registered'), 1);
  await runSync(store, srv.api);
  assert.equal(srv.db.size, 1);
});
