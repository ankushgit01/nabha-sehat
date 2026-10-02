/**
 * Integration test against an in-memory MongoDB (mongodb-memory-server):
 * OTP login → push offline records twice → pull → doctor completes → patient pulls note.
 * Run: cd backend && npm test
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { connect, close } from '../src/db';
import { createApp } from '../src/server';

let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

before(async () => {
  process.env.DOCTOR_PHONES = '+919999999999';
  mongo = await MongoMemoryServer.create();
  await connect(mongo.getUri(), 'test');
  app = createApp();
});
after(async () => {
  await close();
  await mongo.stop();
});

async function login(phone: string) {
  const logs: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => logs.push(m);
  await request(app).post('/v1/auth/otp/request').send({ phone }).expect(200);
  console.warn = orig;
  const code = logs.join(' ').match(/(\d{6})/)![1];
  return (await request(app).post('/v1/auth/otp/verify').send({ phone, code }).expect(200)).body as { token: string; userId: string };
}

test('offline-created records sync idempotently and doctor reply flows back', async () => {
  const p = await login('+919876543210');
  const id = randomUUID();
  const now = new Date().toISOString();
  const rec = {
    id, user_id: p.userId, created_at: now, updated_at: now, server_updated_at: null, sync_status: 'pending',
    symptom_log_id: null, mode: 'chat', status: 'queued', patient_note: 'fever', doctor_id: null, doctor_name: null,
    notes: null, prescription: null, room_url: null, started_at: null, completed_at: null,
  };
  const push = () =>
    request(app).post('/v1/sync/push').set('Authorization', `Bearer ${p.token}`).send({ items: [{ table: 'consultations', base: null, record: rec }] }).expect(200);
  await push();
  await push(); // retry after lost ACK
  const pulled = (await request(app).get('/v1/sync/pull?since=0').set('Authorization', `Bearer ${p.token}`).expect(200)).body;
  const consults = pulled.changes.find((c: { table: string }) => c.table === 'consultations').records;
  assert.equal(consults.length, 1);
  assert.equal(consults[0].status, 'waiting');

  const d = await login('+919999999999');
  await request(app).post(`/v1/doctor/consultations/${id}/accept`).set('Authorization', `Bearer ${d.token}`).expect(200);
  await request(app).post(`/v1/doctor/consultations/${id}/complete`).set('Authorization', `Bearer ${d.token}`).send({ notes: 'ORS', prescription: 'Paracetamol 500mg' }).expect(200);

  const again = (await request(app).get(`/v1/sync/pull?since=${pulled.cursor}`).set('Authorization', `Bearer ${p.token}`).expect(200)).body;
  const c2 = again.changes.find((c: { table: string }) => c.table === 'consultations').records[0];
  assert.equal(c2.status, 'completed');
  assert.equal(c2.prescription, 'Paracetamol 500mg');
});

test("a user cannot push another user's record", async () => {
  const p = await login('+919811111111');
  const now = new Date().toISOString();
  const r = await request(app)
    .post('/v1/sync/push')
    .set('Authorization', `Bearer ${p.token}`)
    .send({ items: [{ table: 'sos_events', base: null, record: { id: randomUUID(), user_id: 'someone-else', created_at: now } }] })
    .expect(200);
  assert.equal(r.body.results[0].status, 'rejected');
});
