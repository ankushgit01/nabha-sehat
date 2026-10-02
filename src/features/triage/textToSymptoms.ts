/**
 * Maps free text / speech transcripts (Punjabi, Hindi, English or romanised
 * "Hinglish") to symptom ids by keyword matching against symptoms.json.
 * Runs fully offline. Known limitations (documented for the medical advisor):
 *  - simple negation only ("no fever", "बुखार नहीं", "ਬੁਖ਼ਾਰ ਨਹੀਂ") within the same clause
 *  - no spelling correction beyond Unicode/nukta normalisation
 * The user always sees and can edit the detected chips before classification.
 */
import { SYMPTOMS } from './vocab';

export function normalise(s: string): string {
  return (
    s
      .normalize('NFC')
      .toLowerCase()
      // Treat nukta variants as equivalent (ज़ ↔ ज, ਖ਼ ↔ ਖ) — speech engines are inconsistent.
      .replace(/़|਼/g, '')
      .replace(/[.,!?;:।|]+/g, ' | ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export interface TextMatch {
  symptomId: string;
  keyword: string;
  negated: boolean;
}

export function extractSymptoms(text: string): TextMatch[] {
  const norm = ` ${normalise(text)} `;
  const clauses = norm.split('|');
  const found = new Map<string, TextMatch>();
  // Longer keywords first so "high fever" wins over "fever", "blood in stool" over "stool".
  const entries = SYMPTOMS.flatMap((s) =>
    Object.values(s.keywords)
      .flat()
      .map((k) => ({ id: s.id, kw: normalise(k) })),
  ).sort((a, b) => b.kw.length - a.kw.length);

  for (const clause of clauses) {
    let remaining = ` ${clause} `;
    for (const { id, kw } of entries) {
      if (!kw) continue;
      const isLatin = /^[a-z0-9 '\-]+$/.test(kw);
      const hit = isLatin ? new RegExp(`(^|[^a-z])${escapeRe(kw)}([^a-z]|$)`).test(remaining) : remaining.includes(kw);
      if (!hit) continue;
      const negated = isNegatedNear(clause, kw);
      if (!found.has(id) || (found.get(id)!.negated && !negated)) found.set(id, { symptomId: id, keyword: kw, negated });
      remaining = remaining.split(kw).join(' # '); // consume so sub-keywords don't double-match
    }
  }
  return [...found.values()];
}

function isNegatedNear(clause: string, kw: string): boolean {
  const i = clause.indexOf(kw);
  if (i < 0) return false;
  const before = clause.slice(Math.max(0, i - 12), i);
  const after = clause.slice(i + kw.length, i + kw.length + 10);
  return /\b(no|not|without)\s*$/.test(before) || /^\s*(नहीं|ਨਹੀਂ|nahi|nahin)/.test(after);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function symptomIdsFromText(text: string): string[] {
  return extractSymptoms(text)
    .filter((m) => !m.negated)
    .map((m) => m.symptomId);
}
