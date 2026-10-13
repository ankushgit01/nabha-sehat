/** Logged-in patient's own profile: GET / PUT /v1/me */
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';

export const me = Router();
me.use(requireAuth);

const PROFILE_FIELDS = ['name', 'age', 'gender', 'village', 'blood_group', 'conditions', 'allergies', 'preferred_language'] as const;

export const profileSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  village: z.string().trim().max(80).nullable().optional(),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  conditions: z.array(z.string().max(40)).max(20).optional(),
  allergies: z.string().trim().max(200).nullable().optional(),
  preferred_language: z.enum(['pa', 'hi', 'en']).optional(),
});

type UserDoc = { _id: string; phone?: string; role?: string; created_at?: string; updated_at?: string } & Record<string, unknown>;

export function publicProfile(u: UserDoc) {
  const out: Record<string, unknown> = { id: u._id, phone: u.phone ?? null, role: u.role ?? 'patient' };
  for (const f of PROFILE_FIELDS) out[f] = u[f] ?? (f === 'conditions' ? [] : null);
  return out;
}

me.get('/', async (req, res) => {
  const u = await getDb().collection<UserDoc>('users').findOne({ _id: req.user!.id });
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json({ profile: publicProfile(u) });
});

me.put('/', async (req, res) => {
  const p = profileSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: p.error.message });
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(p.data)) if (v !== undefined) set[k] = v;
  const users = getDb().collection<UserDoc>('users');
  await users.updateOne({ _id: req.user!.id }, { $set: set });
  const u = await users.findOne({ _id: req.user!.id });
  res.json({ profile: u ? publicProfile(u) : null });
});
