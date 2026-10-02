/**
 * Pure rule evaluation, shared by the app (offline fallback) and the backend
 * (live endpoint with the latest server-side ruleset). No JSON imports here so
 * the backend can import it directly.
 */
import type { Lang } from '../../db/types';

export type Answers = Record<string, boolean | undefined>;
type L10n = Record<Lang, string>;

export interface RuleSet {
  version: string;
  questions: { id: string; type: 'bool'; icon: string; text: L10n }[];
  schemes: {
    id: string;
    name: L10n;
    benefit: L10n;
    anyOf: { id: string; all: string[]; note?: L10n }[];
    nextSteps: L10n;
  }[];
}

export interface SchemeResult {
  schemeId: string;
  name: L10n;
  likelyEligible: boolean;
  matchedCriteria: string[];
  notes: L10n[];
  benefit: L10n;
  nextSteps: L10n;
}

export interface EligibilityOutcome {
  source: 'live' | 'offline_rules';
  rulesVersion: string;
  results: SchemeResult[];
}

export function evaluateRules(answers: Answers, rules: RuleSet, source: EligibilityOutcome['source']): EligibilityOutcome {
  return {
    source,
    rulesVersion: rules.version,
    results: rules.schemes.map((s) => {
      const matched = s.anyOf.filter((c) => c.all.every((q) => answers[q] === true));
      return {
        schemeId: s.id,
        name: s.name,
        likelyEligible: matched.length > 0,
        matchedCriteria: matched.map((m) => m.id),
        notes: matched.flatMap((m) => (m.note ? [m.note] : [])),
        benefit: s.benefit,
        nextSteps: s.nextSteps,
      };
    }),
  };
}
