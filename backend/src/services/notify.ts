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

const DEMO_TTL_MS = 10 * 60_000;
const demoCodes = new Map<string, { code: string; exp: number; tries: number }>();

/** Returns the code ONLY in demo mode (so the app can show it); null when a real SMS was sent. */
export async function sendOtp(phone: string): Promise<{ demoCode: string | null }> {
  const mode = config.otpMode;
  if (mode === 'twilio') {
    if (!client || !config.twilio.verifySid) throw new Error('OTP_MODE=twilio but TWILIO_* env vars are missing');
    await client.verify.v2.services(config.twilio.verifySid).verifications.create({ to: phone, channel: 'sms' });
    return { demoCode: null };
  }
  if (mode === 'off') throw new Error('OTP provider not configured (set OTP_MODE=demo or the TWILIO_* vars)');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  demoCodes.set(phone, { code, exp: Date.now() + DEMO_TTL_MS, tries: 0 });
  console.warn(`[demo-otp] code generated for ${phone.slice(0, 5)}*****`);
  return { demoCode: code };
}

export async function checkOtp(phone: string, code: string): Promise<boolean> {
  if (config.otpMode === 'twilio') {
    if (!client || !config.twilio.verifySid) return false;
    const r = await client.verify.v2.services(config.twilio.verifySid).verificationChecks.create({ to: phone, code });
    return r.status === 'approved';
  }
  const e = demoCodes.get(phone);
  if (!e || e.exp < Date.now() || e.tries >= 5) {
    demoCodes.delete(phone);
    return false;
  }
  e.tries++;
  if (e.code !== code) return false;
  demoCodes.delete(phone);
  return true;
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
