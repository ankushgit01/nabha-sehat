/**
 * Deterministic safety net applied AFTER the model. These rules can only ESCALATE
 * urgency, never lower it, so a model error can't under-triage a red-flag case.
 * Mirrors the emergency rules in ml/labeling_rules.py.
 * REQUIRES SIGN-OFF BY A QUALIFIED MEDICAL ADVISOR BEFORE DEPLOYMENT.
 */
import type { TriageModifiers, UrgencyTier } from '../../db/types';
import { SYMPTOM_BY_ID } from './vocab';

export const TIER_ORDER: UrgencyTier[] = ['self_care', 'routine', 'urgent', 'emergency'];
export const tierRank = (t: UrgencyTier) => TIER_ORDER.indexOf(t);

interface Rule {
  id: string;
  tier: UrgencyTier;
  when: (s: Set<string>, m: TriageModifiers) => boolean;
}

const any = (s: Set<string>, ...ids: string[]) => ids.some((i) => s.has(i));

export const RULES: Rule[] = [
  { id: 'single_red_flag', tier: 'emergency', when: (s) => [...s].some((id) => SYMPTOM_BY_ID.get(id)?.redFlag) },
  { id: 'chest_pain_breathless', tier: 'emergency', when: (s) => s.has('chest_pain') && s.has('breathlessness') },
  { id: 'anaphylaxis', tier: 'emergency', when: (s) => s.has('breathlessness') && s.has('swelling_face') },
  { id: 'fever_confusion', tier: 'emergency', when: (s) => any(s, 'fever', 'high_fever') && s.has('confusion') },
  { id: 'elderly_chest_pain', tier: 'emergency', when: (s, m) => s.has('chest_pain') && m.age_group === 'elderly' },
  {
    id: 'child_pneumonia_signs',
    tier: 'emergency',
    when: (s, m) => m.age_group === 'child' && s.has('breathlessness') && any(s, 'fever', 'high_fever'),
  },
  {
    id: 'vulnerable_high_fever',
    tier: 'urgent',
    when: (s, m) => s.has('high_fever') && (m.age_group !== 'adult' || m.pregnant),
  },
  { id: 'vulnerable_dehydration', tier: 'urgent', when: (s, m) => s.has('dehydration') && m.age_group !== 'adult' },
];

export function applyRedFlags(
  modelTier: UrgencyTier,
  symptoms: string[],
  mods: TriageModifiers,
): { tier: UrgencyTier; fired: string[] } {
  const s = new Set(symptoms);
  let tier = modelTier;
  const fired: string[] = [];
  for (const r of RULES) {
    if (r.when(s, mods) && tierRank(r.tier) > tierRank(tier)) {
      tier = r.tier;
      fired.push(r.id);
    } else if (r.when(s, mods) && r.tier === 'emergency') {
      fired.push(r.id);
    }
  }
  return { tier, fired };
}
