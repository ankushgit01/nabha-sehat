/**
 * Scheme eligibility (live), facility directory, file uploads.
 *
 * "Live" eligibility note: there is no public NHA beneficiary-lookup API for third
 * parties. The live endpoint evaluates the LATEST server-side ruleset (updatable
 * without an app release) and is the integration point for an official lookup if
 * the deployment obtains access via the State Health Agency. The app always tells
 * the user to confirm at the Ayushman desk / 14555.
 */
import { Router } from 'express';
import multer from 'multer';
import { GridFSBucket, ObjectId } from 'mongodb';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { evaluateRules, RuleSet } from '../../../src/features/schemes/evaluate';

const bundledRules = JSON.parse(
  readFileSync(new URL('../../../src/features/schemes/rules.json', import.meta.url), 'utf8'),
) as RuleSet;

async function currentRules(): Promise<RuleSet> {
  const doc = await getDb().collection<RuleSet & { _id: string }>('scheme_rules').findOne({ _id: 'current' });
  return doc ?? bundledRules;
}

export const schemes = Router();
schemes.get('/rules', async (_req, res) => res.json(await currentRules()));
schemes.post('/eligibility', requireAuth, async (req, res) => {
  const answers = z.record(z.string(), z.boolean()).safeParse(req.body?.answers ?? {});
  if (!answers.success) return res.status(400).json({ error: 'invalid answers' });
  res.json(evaluateRules(answers.data, await currentRules(), 'live'));
});

export const facilities = Router();
facilities.get('/', async (_req, res) => {
  const list = await getDb().collection('facilities').find({}).toArray();
  res.json({ facilities: list.map(({ _id, ...f }) => ({ id: _id, ...f })) });
});

export const files = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

files.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file || !ALLOWED.has(req.file.mimetype)) return res.status(400).json({ error: 'unsupported file' });
  const bucket = new GridFSBucket(getDb(), { bucketName: 'uploads' });
  const stream = bucket.openUploadStream(String(req.body.recordId ?? 'file'), {
    metadata: { user_id: req.user!.id, record_id: req.body.recordId, contentType: req.file.mimetype },
  });
  stream.end(req.file.buffer);
  await new Promise((ok, fail) => stream.on('finish', ok).on('error', fail));
  // Hook: heavier server-side image processing (e.g. Python/OpenCV worker) can be queued here.
  res.json({ url: `/v1/files/${stream.id.toString()}` });
});

files.get('/:id', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(404).end();
  const _id = new ObjectId(req.params.id);
  const meta = await getDb().collection('uploads.files').findOne({ _id });
  if (!meta || (meta.metadata?.user_id !== req.user!.id && req.user!.role !== 'doctor')) return res.status(404).end();
  res.setHeader('Content-Type', meta.metadata?.contentType ?? 'application/octet-stream');
  new GridFSBucket(getDb(), { bucketName: 'uploads' }).openDownloadStream(_id).pipe(res);
});
