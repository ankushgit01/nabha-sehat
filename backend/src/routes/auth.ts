import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db';
import { config } from '../config';
import { checkOtp, sendOtp } from '../services/notify';
import { sign } from '../middleware/auth';

export const auth = Router();
const phone = z.string().regex(/^\+91\d{10}$/);
const otpLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

auth.post('/otp/request', otpLimiter, async (req, res) => {
  const p = phone.safeParse(req.body?.phone);
  if (!p.success) return res.status(400).json({ error: 'invalid phone' });
  await sendOtp(p.data);
  res.json({ ok: true });
});

auth.post('/otp/verify', otpLimiter, async (req, res) => {
  const body = z
    .object({ phone, code: z.string().regex(/^\d{4,8}$/), deviceUserId: z.string().uuid().optional() })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid request' });
  if (!(await checkOtp(body.data.phone, body.data.code))) return res.status(401).json({ error: 'wrong code' });

  const users = getDb().collection<{ _id: string; phone: string; registration_status: string; role: string; created_at: string; updated_at: string }>('users');
  const now = new Date().toISOString();
  const role = config.doctorPhones.has(body.data.phone) ? 'doctor' : 'patient';
  // Returning user on a new device keeps their existing id, so all their records merge.
  const existing = await users.findOne({ phone: body.data.phone });
  const id = existing?._id ?? body.data.deviceUserId ?? randomUUID();
  await users.updateOne(
    { _id: id },
    { $set: { phone: body.data.phone, registration_status: 'registered', role, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
  res.json({ token: sign({ id, phone: body.data.phone, role }), userId: id, phone: body.data.phone });
});
