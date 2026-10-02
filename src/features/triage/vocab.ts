import raw from './symptoms.json';
import type { Lang, UrgencyTier } from '../../db/types';

export interface SymptomDef {
  id: string;
  bodyPart: string;
  icon: string;
  tier: UrgencyTier;
  concern: string;
  redFlag: boolean;
  firstAid: string | null;
  label: Record<Lang, string>;
  keywords: Record<Lang, string[]>;
}
export interface BodyPartDef {
  id: string;
  icon: string;
  label: Record<Lang, string>;
}

export const VOCAB_VERSION: string = raw.version;
export const SYMPTOMS: SymptomDef[] = raw.symptoms as SymptomDef[];
export const BODY_PARTS: BodyPartDef[] = raw.bodyParts as BodyPartDef[];
export const MODIFIERS: string[] = raw.modifiers;
export const SYMPTOM_BY_ID = new Map(SYMPTOMS.map((s) => [s.id, s]));
