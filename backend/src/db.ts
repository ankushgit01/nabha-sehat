/**
 * MongoDB Atlas access. Collections mirror the SQLite tables field-for-field
 * (`_id` = the client UUID `id`), so sync maps 1:1.
 */
import { Db, MongoClient } from 'mongodb';
import { config } from './config';
import { validators } from './models/schemas';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(uri = config.mongoUri, name = config.mongoDb): Promise<Db> {
  client = new MongoClient(uri, { retryWrites: true });
  await client.connect();
  db = client.db(name);
  await ensureCollections(db);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('DB not connected');
  return db;
}

export async function close() {
  await client?.close();
  client = null;
  db = null;
}

async function ensureCollections(d: Db) {
  const existing = new Set((await d.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, $jsonSchema] of Object.entries(validators)) {
    if (!existing.has(name)) await d.createCollection(name, { validator: { $jsonSchema }, validationLevel: 'moderate' });
    else await d.command({ collMod: name, validator: { $jsonSchema }, validationLevel: 'moderate' }).catch(() => undefined);
  }
  for (const c of ['symptom_logs', 'consultations', 'sos_events', 'health_records']) {
    await d.collection(c).createIndex({ user_id: 1, server_updated_at: 1 });
  }
  await d.collection('consultations').createIndex({ status: 1, created_at: 1 });
  await d.collection('record_history').createIndex({ table: 1, record_id: 1, archived_at: -1 });
  await d.collection('users').createIndex({ phone: 1 }, { unique: true, sparse: true });
  await d.collection('consultation_messages').createIndex({ consultation_id: 1, at: 1 });
}
