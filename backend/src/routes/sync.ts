import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { pullChanges, pushRecords, SYNC_TABLES } from '../services/syncService';
import type { SyncRecord } from '../../../src/db/types';

export const sync = Router();
sync.use(requireAuth);

const pushSchema = z.object({
  items: z
    .array(
      z.object({
        table: z.enum(SYNC_TABLES as [string, ...string[]]),
        base: z.number().nullable(),
        record: z.object({ id: z.string().uuid(), user_id: z.string(), created_at: z.string() }).passthrough(),
      }),
    )
    .max(100),
});

sync.post('/push', async (req, res) => {
  const p = pushSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.message });
  const results = await pushRecords(
    getDb(),
    req.user!.id,
    p.data.items as unknown as { table: (typeof SYNC_TABLES)[number]; record: SyncRecord; base: number | null }[],
  );
  res.json({ results });
});

sync.get('/pull', async (req, res) => {
  const since = Number(req.query.since ?? 0);
  if (!Number.isFinite(since) || since < 0) return res.status(400).json({ error: 'bad cursor' });
  res.json(await pullChanges(getDb(), req.user!.id, since));
});
