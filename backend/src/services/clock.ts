/**
 * Strictly increasing server timestamp, shared across instances via a counter
 * document: next = max(stored, now) + 1. This is the "server timestamp" that
 * last-write-wins compares, so two writes can never tie.
 */
import type { Db } from 'mongodb';

export async function nextStamp(db: Db): Promise<number> {
  const now = Date.now();
  const res = await db.collection<{ _id: string; v: number }>('counters').findOneAndUpdate(
    { _id: 'sync_clock' },
    [{ $set: { v: { $add: [{ $max: [{ $ifNull: ['$v', 0] }, now] }, 1] } } }],
    { upsert: true, returnDocument: 'after' },
  );
  if (!res) throw new Error('clock unavailable');
  return res.v;
}
