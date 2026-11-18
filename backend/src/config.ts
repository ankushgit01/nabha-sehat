import { createHash } from 'node:crypto';

const req = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

/**
 * JWT signing key. Prefer a dedicated JWT_SECRET. If it is unset or empty, derive a stable
 * key from MONGODB_URI (already a secret, and stable across restarts so logins survive the
 * free tier spinning down). Changing the Mongo password then logs everyone out once.
 * Set JWT_SECRET (any long random string) to stop using the fallback.
 */
function jwtSecret(): string {
  const own = process.env.JWT_SECRET?.trim();
  if (own) return own;
  if (process.env.NODE_ENV !== 'production') return 'dev-only-secret';
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Missing env JWT_SECRET (and no MONGODB_URI to derive one from)');
  console.warn('JWT_SECRET is empty: using a key derived from MONGODB_URI. Set JWT_SECRET to a long random string.');
  return createHash('sha256').update(`nabha-jwt-v1:${uri}`).digest('base64url');
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  prod: process.env.NODE_ENV === 'production',
  mongoUri: req('MONGODB_URI', 'mongodb://127.0.0.1:27017'),
  mongoDb: req('MONGODB_DB', 'nabha'),
  jwtSecret: jwtSecret(),
  jwtTtl: process.env.JWT_TTL ?? '30d',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    verifySid: process.env.TWILIO_VERIFY_SERVICE_SID,
    from: process.env.TWILIO_FROM_NUMBER,
    facilityAlertNumbers: (process.env.FACILITY_ALERT_NUMBERS ?? '').split(',').filter(Boolean),
  },
  /**
   * OTP delivery: 'twilio' (real SMS — needs the TWILIO_* vars) or 'demo' (the code is
   * returned to the app and shown on screen; for testing/pilots ONLY — anyone can log in
   * as any number). Defaults to twilio when configured, otherwise demo outside production.
   */
  get otpMode(): 'twilio' | 'demo' | 'off' {
    const m = process.env.OTP_MODE;
    if (m === 'twilio' || m === 'demo') return m;
    if (process.env.TWILIO_VERIFY_SERVICE_SID) return 'twilio';
    return process.env.NODE_ENV === 'production' ? 'off' : 'demo';
  },
  /** Secret for /v1/admin (CSV exports). Unset = admin routes disabled. */
  get adminKey() {
    return process.env.ADMIN_KEY ?? '';
  },
  /** Claude API key for /v1/ai/check (photo + symptom first-aid guidance). Unset = feature off. */
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY ?? '';
  },
  /** Read lazily so tests / config reloads can change it. */
  get doctorPhones() {
    return new Set((process.env.DOCTOR_PHONES ?? '').split(',').filter(Boolean));
  },
};
