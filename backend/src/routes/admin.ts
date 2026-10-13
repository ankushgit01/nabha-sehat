/**
 * Admin CSV exports for the hospital / programme team.
 *
 *   GET /v1/admin                         → simple page with download links
 *   GET /v1/admin/export/users.csv
 *   GET /v1/admin/export/symptom_logs.csv  (each row joined with the patient's phone/age/gender)
 *   GET /v1/admin/export/consultations.csv
 *   GET /v1/admin/export/sos_events.csv
 *   optional ?from=2026-10-01&to=2026-10-31 (by created_at)
 *
 * Protected by ADMIN_KEY (header `x-admin-key` or `?key=`). If ADMIN_KEY is not set,
 * these routes are disabled. Exports contain health data: share them only with
 * authorised staff.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '../db';
import { config } from '../config';
import { EXPORT_COLUMNS, toCsv, type ExportTable } from '../../../src/features/records/csv';

export const admin = Router();

function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const expected = config.adminKey;
  if (!expected) return res.status(404).json({ error: 'admin export disabled (set ADMIN_KEY)' });
  const given = String(req.header('x-admin-key') ?? req.query.key ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'bad admin key' });
  next();
}
admin.use(requireAdminKey);

const TABLES = Object.keys(EXPORT_COLUMNS) as ExportTable[];

admin.get('/', (req, res) => {
  const key = encodeURIComponent(String(req.query.key ?? ''));
  const links = TABLES.map((t) => `<li><a href="/v1/admin/export/${t}.csv?key=${key}">${t}.csv</a></li>`).join('');
  res.type('html').send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nabha Sehat exports</title>` +
      `<body style="font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem">` +
      `<h1>Nabha Sehat – data exports</h1><p>Download CSV (opens in Excel / Google Sheets). Add <code>&from=YYYY-MM-DD&to=YYYY-MM-DD</code> to filter by date.</p>` +
      `<ul>${links}</ul><p style="color:#b00020">Contains patient health data – handle confidentially.</p></body>`,
  );
});

admin.get('/export/:file', async (req, res) => {
  const table = req.params.file.replace(/\.csv$/, '') as ExportTable;
  if (!TABLES.includes(table)) return res.status(404).json({ error: `use one of: ${TABLES.join(', ')}` });

  const filter: Record<string, unknown> = {};
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (from || to) {
    filter.created_at = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: `${to}T23:59:59.999Z` } : {}),
    };
  }

  const db = getDb();
  const docs = await db.collection(table).find(filter).sort({ created_at: -1 }).limit(100_000).toArray();

  // Join each record with the patient's profile so the CSV is self-explanatory.
  let rows: Record<string, unknown>[];
  if (table === 'users') {
    rows = docs.map(({ _id, ...u }) => ({ id: _id, ...u }));
  } else {
    const ids = [...new Set(docs.map((d) => d.user_id as string))];
    const users = await db.collection('users').find({ _id: { $in: ids as never[] } }).toArray();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    rows = docs.map(({ _id, ...r }) => {
      const u = byId.get(String(r.user_id)) ?? {};
      return { id: _id, ...r, phone: u.phone, name: u.name, age: u.age, gender: u.gender, village: u.village };
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nabha_${table}_${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(toCsv([...EXPORT_COLUMNS[table]], rows as never));
});
