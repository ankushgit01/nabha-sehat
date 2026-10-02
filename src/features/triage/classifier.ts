/**
 * On-device urgency classification — the one interface the UI talks to.
 *
 * Engine choice (flagged deviation from spec §4, see README "Triage engine"):
 * DEFAULT = `JsMlpEngine`: the trained network's weights ship as JSON and run in
 * plain TypeScript. Same model as the .tflite file, but needs no native module,
 * works in Expo Go AND on web, and runs in well under 5 ms on low-end phones.
 * OPTIONAL = `TfliteEngine` (classifier.tflite.native.ts) via react-native-fast-tflite
 * 3.x for when a larger model (e.g. image classification) justifies native code.
 */
import type { TriageModifiers, UrgencyTier } from '../../db/types';
import weights from '../../assets/models/triage_mlp_v1.json';
import { applyRedFlags } from './redFlags';
import { MODIFIERS, SYMPTOM_BY_ID, SYMPTOMS } from './vocab';

export interface TriageInput {
  symptoms: string[];
  modifiers: TriageModifiers;
}

export interface TriageResult {
  urgency: UrgencyTier;
  modelUrgency: UrgencyTier;
  confidence: number;
  probabilities: Record<UrgencyTier, number>;
  concernAreas: string[];
  redFlags: string[];
  /** First-aid topic id to show (bundled offline), if any. */
  adviceTopic: string | null;
  modelVersion: string;
  inferenceMs: number;
}

export interface UrgencyEngine {
  readonly version: string;
  /** Returns probabilities in TIER order. */
  predict(features: Float32Array): Promise<number[]> | number[];
}

interface MlpJson {
  model_version: string;
  features: string[];
  tiers: UrgencyTier[];
  layers: { W: number[][]; b: number[]; activation: 'relu' | 'softmax' }[];
}

export class JsMlpEngine implements UrgencyEngine {
  readonly version: string;
  private layers: { W: Float32Array; b: Float32Array; inDim: number; outDim: number; act: string }[];

  constructor(model: MlpJson = weights as unknown as MlpJson) {
    this.version = model.model_version;
    const expected = [...SYMPTOMS.map((s) => s.id), ...MODIFIERS];
    if (model.features.join() !== expected.join()) {
      throw new Error('Triage model feature order does not match symptoms.json — retrain with ml/train.py');
    }
    this.layers = model.layers.map((l) => {
      const inDim = l.W.length;
      const outDim = l.b.length;
      const W = new Float32Array(inDim * outDim);
      l.W.forEach((row, i) => row.forEach((v, j) => (W[i * outDim + j] = v)));
      return { W, b: Float32Array.from(l.b), inDim, outDim, act: l.activation };
    });
  }

  predict(x: Float32Array): number[] {
    let h: Float32Array = x;
    for (const L of this.layers) {
      const out = new Float32Array(L.outDim);
      for (let j = 0; j < L.outDim; j++) {
        let acc = L.b[j]!;
        for (let i = 0; i < L.inDim; i++) acc += h[i]! * L.W[i * L.outDim + j]!;
        out[j] = acc;
      }
      if (L.act === 'relu') for (let j = 0; j < out.length; j++) out[j] = Math.max(0, out[j]!);
      else {
        const m = Math.max(...out);
        let sum = 0;
        for (let j = 0; j < out.length; j++) sum += out[j] = Math.exp(out[j]! - m);
        for (let j = 0; j < out.length; j++) out[j] = out[j]! / sum;
      }
      h = out;
    }
    return Array.from(h);
  }
}

const TIERS: UrgencyTier[] = ['self_care', 'routine', 'urgent', 'emergency'];

export function encodeFeatures(input: TriageInput): Float32Array {
  const v = new Float32Array(SYMPTOMS.length + MODIFIERS.length);
  const set = new Set(input.symptoms);
  SYMPTOMS.forEach((s, i) => (v[i] = set.has(s.id) ? 1 : 0));
  const m = input.modifiers;
  const base = SYMPTOMS.length;
  v[base] = m.age_group === 'child' ? 1 : 0;
  v[base + 1] = m.age_group === 'elderly' ? 1 : 0;
  v[base + 2] = m.pregnant ? 1 : 0;
  v[base + 3] = m.duration_days > 7 ? 1 : 0;
  return v;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function classify(input: TriageInput, engine: UrgencyEngine = defaultEngine()): Promise<TriageResult> {
  const t0 = now();
  const probs = await engine.predict(encodeFeatures(input));
  let best = 0;
  probs.forEach((p, i) => p > probs[best]! && (best = i));
  const modelUrgency = TIERS[best]!;
  const { tier, fired } = applyRedFlags(modelUrgency, input.symptoms, input.modifiers);
  const inferenceMs = now() - t0;

  const concernCounts = new Map<string, number>();
  for (const id of input.symptoms) {
    const c = SYMPTOM_BY_ID.get(id)?.concern;
    if (c) concernCounts.set(c, (concernCounts.get(c) ?? 0) + 1);
  }
  const concernAreas = [...concernCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

  // Pick the first-aid topic from the most severe symptom that has one.
  const rank = (t: UrgencyTier) => TIERS.indexOf(t);
  const adviceTopic =
    input.symptoms
      .map((id) => SYMPTOM_BY_ID.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s?.firstAid)
      .sort((a, b) => rank(b.tier) - rank(a.tier) || Number(b.redFlag) - Number(a.redFlag))[0]?.firstAid ??
    (tier === 'emergency' ? 'general_emergency' : null);

  return {
    urgency: tier,
    modelUrgency,
    confidence: probs[best]!,
    probabilities: Object.fromEntries(TIERS.map((t, i) => [t, probs[i]!])) as Record<UrgencyTier, number>,
    concernAreas,
    redFlags: fired,
    adviceTopic,
    modelVersion: engine.version,
    inferenceMs,
  };
}

let _engine: UrgencyEngine | null = null;
export function defaultEngine(): UrgencyEngine {
  return (_engine ??= new JsMlpEngine());
}
export function setEngine(e: UrgencyEngine) {
  _engine = e;
}
