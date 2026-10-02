const req = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 8080),
  prod: process.env.NODE_ENV === 'production',
  mongoUri: req('MONGODB_URI', 'mongodb://127.0.0.1:27017'),
  mongoDb: req('MONGODB_DB', 'nabha'),
  jwtSecret: req('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret'),
  jwtTtl: process.env.JWT_TTL ?? '30d',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    verifySid: process.env.TWILIO_VERIFY_SERVICE_SID,
    from: process.env.TWILIO_FROM_NUMBER,
    facilityAlertNumbers: (process.env.FACILITY_ALERT_NUMBERS ?? '').split(',').filter(Boolean),
  },
  /** Read lazily so tests / config reloads can change it. */
  get doctorPhones() {
    return new Set((process.env.DOCTOR_PHONES ?? '').split(',').filter(Boolean));
  },
};
