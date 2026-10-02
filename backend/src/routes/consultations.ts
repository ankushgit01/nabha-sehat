/**
 * Patient + doctor consultation endpoints. Status / notes / prescription are
 * written ONLY here (server-owned fields) and reach the patient via sync pull.
 * Audio/video rooms: `room_url` is produced by `createRoom`, a stub you wire to a
 * WebRTC provider that works on 2G/3G (e.g. Jitsi with low-bandwidth mode, or a
 * managed provider). Chat works on the weakest connections and is the default.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { nextStamp } from '../services/clock';

export const consultations = Router();
consultations.use(requireAuth);

type C = { _id: string; user_id: string; status: string; mode: string; created_at: string; [k: string]: unknown };
const col = () => getDb().collection<C>('consultations');
const toApi = ({ _id, ...rest }: C) => ({ id: _id, ...rest });

async function createRoom(consultationId: string): Promise<string> {
  // TODO(integration): call your video provider; return a join URL.
  return `https://meet.jit.si/nabha-${consultationId}`;
}

consultations.get('/availability', async (_req, res) => {
  const db = getDb();
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const [doctorsOnline, waiting] = await Promise.all([
    db.collection('doctor_presence').countDocuments({ seen_at: { $gt: since } }),
    col().countDocuments({ status: 'waiting' }),
  ]);
  res.json({ doctorsOnline, waiting });
});

consultations.get('/:id/queue', async (req, res) => {
  const c = await col().findOne({ _id: req.params.id, user_id: req.user!.id });
  if (!c) return res.status(404).json({ error: 'not found' });
  const position = c.status === 'waiting' ? (await col().countDocuments({ status: 'waiting', created_at: { $lt: c.created_at } })) + 1 : 0;
  res.json({ position, consultation: toApi(c) });
});

async function canAccess(id: string, user: { id: string; role: string }) {
  const c = await col().findOne({ _id: id });
  return c && (c.user_id === user.id || user.role === 'doctor' || user.role === 'admin') ? c : null;
}

consultations.get('/:id/messages', async (req, res) => {
  if (!(await canAccess(req.params.id, req.user!))) return res.status(404).json({ error: 'not found' });
  const msgs = await getDb().collection('consultation_messages').find({ consultation_id: req.params.id }).sort({ at: 1 }).toArray();
  res.json({ messages: msgs.map((m) => ({ id: String(m._id), from: m.from, text: m.text, at: m.at })) });
});

consultations.post('/:id/messages', async (req, res) => {
  const c = await canAccess(req.params.id, req.user!);
  if (!c) return res.status(404).json({ error: 'not found' });
  const text = z.string().min(1).max(2000).safeParse(req.body?.text);
  if (!text.success) return res.status(400).json({ error: 'empty' });
  await getDb().collection('consultation_messages').insertOne({
    _id: randomUUID() as never,
    consultation_id: c._id,
    from: req.user!.role === 'doctor' ? 'doctor' : 'patient',
    text: text.data,
    at: new Date().toISOString(),
  });
  res.json({ ok: true });
});

// ---- Doctor side ----
export const doctor = Router();
doctor.use(requireAuth, requireRole('doctor'));

doctor.post('/presence', async (req, res) => {
  await getDb().collection('doctor_presence').updateOne(
    { _id: req.user!.id as never },
    { $set: { seen_at: new Date().toISOString() } },
    { upsert: true },
  );
  res.json({ ok: true });
});

doctor.get('/queue', async (_req, res) => {
  const list = await col().find({ status: { $in: ['waiting', 'active'] } }).sort({ created_at: 1 }).limit(50).toArray();
  // Attach the linked triage so the doctor sees urgency + symptoms first.
  const logs = await getDb()
    .collection('symptom_logs')
    .find({ _id: { $in: list.map((c) => c.symptom_log_id).filter(Boolean) as never[] } })
    .toArray();
  const byId = new Map(logs.map((l) => [String(l._id), l]));
  res.json({ queue: list.map((c) => ({ ...toApi(c), triage: byId.get(String(c.symptom_log_id)) ?? null })) });
});

doctor.post('/consultations/:id/accept', async (req, res) => {
  const stamp = await nextStamp(getDb());
  const c = await col().findOne({ _id: req.params.id, status: 'waiting' });
  if (!c) return res.status(409).json({ error: 'not waiting' });
  const room_url = c.mode === 'chat' ? null : await createRoom(c._id);
  await col().updateOne(
    { _id: c._id },
    {
      $set: {
        status: 'active',
        doctor_id: req.user!.id,
        doctor_name: req.body?.doctorName ?? null,
        room_url,
        started_at: new Date().toISOString(),
        server_updated_at: stamp,
      },
    },
  );
  res.json({ ok: true, room_url });
});

doctor.post('/consultations/:id/complete', async (req, res) => {
  const body = z.object({ notes: z.string().max(5000), prescription: z.string().max(5000).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid' });
  const stamp = await nextStamp(getDb());
  const r = await col().updateOne(
    { _id: req.params.id, doctor_id: req.user!.id },
    {
      $set: {
        status: 'completed',
        notes: body.data.notes,
        prescription: body.data.prescription ?? null,
        completed_at: new Date().toISOString(),
        server_updated_at: stamp,
      },
    },
  );
  if (!r.matchedCount) return res.status(404).json({ error: 'not your consultation' });
  res.json({ ok: true });
});
