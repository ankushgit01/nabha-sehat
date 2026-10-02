/** Seeds facilities + current scheme rules from the app's bundled JSON. */
import { readFileSync } from 'node:fs';
import { connect, close } from './db';

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const db = await connect();
const seed = read('../../src/features/facilities/seed.json') as { facilities: { id: string }[] };
for (const { id, ...f } of seed.facilities) {
  await db.collection('facilities').replaceOne({ _id: id as never }, f, { upsert: true });
}
const rules = read('../../src/features/schemes/rules.json');
await db.collection('scheme_rules').replaceOne({ _id: 'current' as never }, rules, { upsert: true });
console.log(`seeded ${seed.facilities.length} facilities, rules ${rules.version}`);
await close();
