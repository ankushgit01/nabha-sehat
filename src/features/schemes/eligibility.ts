/**
 * Scheme eligibility: live API when online, bundled rules otherwise.
 * The offline result is ALWAYS labelled "based on general rules — confirm online".
 */
import bundled from './rules.json';
import { Answers, EligibilityOutcome, evaluateRules, RuleSet } from './evaluate';

export type { Answers, EligibilityOutcome, RuleSet, SchemeResult } from './evaluate';

export const BUNDLED_RULES = bundled as unknown as RuleSet;

export function evaluateOffline(answers: Answers, rules: RuleSet = BUNDLED_RULES): EligibilityOutcome {
  return evaluateRules(answers, rules, 'offline_rules');
}

/** Live check with a short timeout; falls back to bundled rules on ANY failure. */
export async function checkEligibility(
  answers: Answers,
  live: ((a: Answers) => Promise<EligibilityOutcome>) | null,
  rules?: RuleSet,
): Promise<EligibilityOutcome> {
  if (live) {
    try {
      return await Promise.race([
        live(answers),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
    } catch {
      /* fall through to offline rules */
    }
  }
  return evaluateOffline(answers, rules);
}
