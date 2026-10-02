/**
 * Twilio: OTP (Verify) and best-effort facility SOS alerts.
 * The facility alert is a SECONDARY channel: it fires only when an SOS log reaches
 * the server (possibly hours later). The primary SOS path is the phone's own
 * call/SMS and never depends on this.
 */
import twilio from 'twilio';
import { config } from '../config';
import type { SosEvent } from '../../../src/db/types';

const client = config.twilio.sid && config.twilio.token ? twilio(config.twilio.sid, config.twilio.token) : null;
const devCodes = new Map<string, string>();

export async function sendOtp(phone: string) {
  if (client && config.twilio.verifySid) {
    await client.verify.v2.services(config.twilio.verifySid).verifications.create({ to: phone, channel: 'sms' });
    return;
  }
  if (config.prod) throw new Error('OTP provider not configured');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  devCodes.set(phone, code);
  console.warn(`[dev] OTP for ${phone}: ${code}`);
}

export async function checkOtp(phone: string, code: string): Promise<boolean> {
  if (client && config.twilio.verifySid) {
    const r = await client.verify.v2.services(config.twilio.verifySid).verificationChecks.create({ to: phone, code });
    return r.status === 'approved';
  }
  if (config.prod) return false;
  const ok = devCodes.get(phone) === code;
  if (ok) devCodes.delete(phone);
  return ok;
}

export async function notifySosToFacility(ev: SosEvent) {
  if (!client || !config.twilio.from || !config.twilio.facilityAlertNumbers.length) return;
  const loc = ev.latitude != null ? `https://maps.google.com/?q=${ev.latitude},${ev.longitude}` : 'location unavailable';
  const ageMin = Math.round((Date.now() - Date.parse(ev.created_at)) / 60000);
  const body = `SOS logged ${ageMin} min ago via Nabha Sehat. ${ev.reported_symptom ?? ''} ${loc}`;
  await Promise.allSettled(
    config.twilio.facilityAlertNumbers.map((to) => client.messages.create({ to, from: config.twilio.from!, body })),
  );
}
