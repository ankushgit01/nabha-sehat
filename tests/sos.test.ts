/**
 * SOS works with ZERO network: the service has no API dependency, the log is
 * written before anything else, and failures in GPS/SMS/call never lose the log.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createMemoryStore } from '../src/platform/storage/memoryStore';
import { createRepository } from '../src/features/sync/repository';
import { planContacts, startSos, SosDeps } from '../src/features/sos/sosService';
import { emergencyFacilityNumber } from '../src/features/facilities/nearest';
import type { Facility, SosEvent } from '../src/db/types';
import seed from '../src/features/facilities/seed.json';

function deps(over: Partial<SosDeps> = {}) {
  const store = createMemoryStore();
  const repo = createRepository({ store, newId: randomUUID, identity: () => ({ userId: 'u', registered: true }) });
  const calls: string[] = [];
  const d: SosDeps = {
    repo,
    getLocation: async () => ({ fix: { latitude: 30.37, longitude: 76.15, accuracy: 12 }, error: null }),
    sendSms: async (n, body) => (calls.push(`sms:${n.join(',')}:${body}`), 'sent'),
    placeCall: async (n) => (calls.push(`call:${n}`), 'dialled'),
    mapsLink: (a, b) => `https://maps.google.com/?q=${a},${b}`,
    message: ({ symptom, link }) => `HELP ${symptom ?? ''} ${link ?? 'no-location'}`,
    ...over,
  };
  return { d, store, calls };
}

test('SOS module has no network/API imports', () => {
  const src = readFileSync(new URL('../src/features/sos/sosService.ts', import.meta.url), 'utf8');
  assert.ok(!/from ['"].*api\//.test(src) && !/axios|fetch\(/.test(src));
});

test('happy path: log → location → SMS with maps link → call; record released for sync', async () => {
  const { d, store, calls } = deps();
  const ev = await startSos(d, { plan: { smsTo: ['9876500000'], callTo: '9876500000' }, reportedSymptom: 'Snake bite' });
  assert.equal(calls[0], 'sms:9876500000:HELP Snake bite https://maps.google.com/?q=30.37,76.15');
  assert.equal(calls[1], 'call:9876500000');
  const saved = (await store.get<SosEvent>('sos_events', ev.id))!;
  assert.equal(saved.latitude, 30.37);
  assert.equal(saved.sms_status, 'sent');
  assert.equal(saved.call_status, 'dialled');
  assert.equal(saved.sync_status, 'pending');
});

test('no GPS: still logs, SMS sent without location, call placed', async () => {
  const { d, store, calls } = deps({ getLocation: async () => ({ fix: null, error: 'location_off' }) });
  const ev = await startSos(d, { plan: planContacts([], '108'), reportedSymptom: null });
  assert.match(calls[0]!, /no-location/);
  assert.equal(calls[1], 'call:108');
  const saved = (await store.get<SosEvent>('sos_events', ev.id))!;
  assert.equal(saved.location_error, 'location_off');
});

test('log exists even if the SMS step throws', async () => {
  const { d, store } = deps({ sendSms: async () => { throw new Error('composer crashed'); } });
  await assert.rejects(startSos(d, { plan: planContacts([], '108'), reportedSymptom: null }));
  const all = await store.list<SosEvent>('sos_events');
  assert.equal(all.length, 1);
  assert.equal(all[0]!.sync_status, 'local_only', 'held — syncEngine releases it after 2 min');
});

test('facility fallback is 108 while seed numbers are unverified', () => {
  assert.equal(emergencyFacilityNumber(seed.facilities as Facility[], { latitude: 30.37, longitude: 76.15 }), '108');
});
