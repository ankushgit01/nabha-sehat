/**
 * Triage latency benchmark. On a dev machine this proves the algorithmic cost;
 * the SAME measurement is shown in-app on every result ("Checked on this phone in
 * N ms", stored as symptom_logs.inference_ms) so it can be read off the 2 GB
 * reference device during field testing (spec §8 — measure on the real device).
 *
 *   npm run bench:triage
 */
import { classify, JsMlpEngine } from '../src/features/triage/classifier';
import { SYMPTOMS } from '../src/features/triage/vocab';

async function main() {
const t0 = performance.now();
const engine = new JsMlpEngine();
const load = performance.now() - t0;

const N = 5000;
const times: number[] = [];
for (let i = 0; i < N; i++) {
  const k = 1 + (i % 4);
  const syms = Array.from({ length: k }, (_, j) => SYMPTOMS[(i * 7 + j * 13) % SYMPTOMS.length]!.id);
  const s = performance.now();
  await classify({ symptoms: syms, modifiers: { age_group: 'adult', pregnant: false, duration_days: 2 } }, engine);
  times.push(performance.now() - s);
}
times.sort((a, b) => a - b);
const p = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(3);
console.log(`model load ${load.toFixed(2)} ms | per-inference p50 ${p(0.5)} ms, p95 ${p(0.95)} ms, p99 ${p(0.99)} ms (budget: 2000–3000 ms)`);
}
void main();
