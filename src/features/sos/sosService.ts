/**
 * SOS orchestration. Has NO network dependency at all: no import of the API
 * client is allowed here (checked by tests/sos.test.ts). Ordering is chosen so
 * that the most important things happen first and nothing waits on GPS:
 *   1. write the SOS log locally (append-only safety record) — immediately
 *   2. resolve location with a hard timeout (GPS works without data)
 *   3. hand off SMS (with location if we got it) to the native composer
 *   4. hand off the phone call to the native dialler
 * First-aid content is rendered by the screen in parallel from the app bundle.
 */
import type { Repository } from '../sync/repository';
import type { EmergencyContact, SosEvent } from '../../db/types';
import type { LocationResult } from '../../platform/location';

export interface SosDeps {
  repo: Repository;
  getLocation: (timeoutMs: number) => Promise<LocationResult>;
  sendSms: (numbers: string[], body: string) => Promise<SosEvent['sms_status']>;
  placeCall: (number: string) => Promise<SosEvent['call_status']>;
  mapsLink: (lat: number, lon: number) => string;
  /** Localised message builders. */
  message: (p: { symptom: string | null; link: string | null }) => string;
}

export interface SosPlan {
  smsTo: string[];
  callTo: string;
}

/** Who to contact: user's contacts get the SMS; the call goes to the first contact, else 108/facility. */
export function planContacts(contacts: EmergencyContact[], facilityNumber: string): SosPlan {
  const personal = contacts.map((c) => c.phone).filter(Boolean);
  return {
    smsTo: personal.length ? personal : [facilityNumber],
    callTo: personal[0] ?? facilityNumber,
  };
}

export async function startSos(
  deps: SosDeps,
  opts: { plan: SosPlan; reportedSymptom: string | null; skipSms?: boolean; skipCall?: boolean },
  onProgress?: (e: { stage: 'logged' | 'located' | 'sms' | 'call'; event: SosEvent }) => void,
): Promise<SosEvent> {
  // 1. Log first — even if everything after this fails, the event is on the device.
  let ev = await deps.repo.create('sos_events', {
    latitude: null,
    longitude: null,
    location_accuracy_m: null,
    location_error: null,
    reported_symptom: opts.reportedSymptom,
    contacted_numbers: [...new Set([...opts.plan.smsTo, opts.plan.callTo])],
    sms_status: 'not_attempted',
    call_status: 'not_attempted',
  }, { hold: true }); // held until the location step below completes it
  onProgress?.({ stage: 'logged', event: ev });

  // 2. Location (best effort, bounded).
  const loc = await deps.getLocation(8000);
  ev = await deps.repo.update('sos_events', ev.id, {
    latitude: loc.fix?.latitude ?? null,
    longitude: loc.fix?.longitude ?? null,
    location_accuracy_m: loc.fix?.accuracy ?? null,
    location_error: loc.error,
  }, { hold: true });
  onProgress?.({ stage: 'located', event: ev });

  // 3. SMS.
  if (!opts.skipSms) {
    const link = loc.fix ? deps.mapsLink(loc.fix.latitude, loc.fix.longitude) : null;
    const sms = await deps.sendSms(opts.plan.smsTo, deps.message({ symptom: opts.reportedSymptom, link }));
    ev = await deps.repo.update('sos_events', ev.id, { sms_status: sms }, { hold: true });
    onProgress?.({ stage: 'sms', event: ev });
  }

  // 4. Call.
  const call = opts.skipCall ? 'not_attempted' : await deps.placeCall(opts.plan.callTo);
  // Final write releases the hold so the event syncs. If the app dies before this,
  // syncEngine releases held SOS events older than 2 minutes — they are never stranded.
  ev = await deps.repo.update('sos_events', ev.id, { call_status: call });
  if (!opts.skipCall) onProgress?.({ stage: 'call', event: ev });
  return ev;
}
