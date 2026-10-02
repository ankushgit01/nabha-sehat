/** Localisation + bundled content integrity: every language has every string. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/i18n/locales/en.json';
import hi from '../src/i18n/locales/hi.json';
import pa from '../src/i18n/locales/pa.json';
import firstAid from '../src/assets/first-aid/firstAid.json';
import vocab from '../src/features/triage/symptoms.json';
import model from '../src/assets/models/triage_mlp_v1.json';
import { evaluateOffline, BUNDLED_RULES } from '../src/features/schemes/eligibility';

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

test('hi and pa have exactly the same keys as en', () => {
  const e = keys(en).sort();
  assert.deepEqual(keys(hi).sort(), e);
  assert.deepEqual(keys(pa).sort(), e);
});

test('Gurmukhi / Devanagari strings are actually in their scripts', () => {
  assert.match(pa.home.checkSymptoms, /[਀-੿]/);
  assert.match(hi.home.checkSymptoms, /[ऀ-ॿ]/);
});

test('every first-aid topic has steps in all 3 languages, and every referenced topic exists', () => {
  const topics = firstAid.topics as Record<string, { do: Record<string, string[]>; dont: Record<string, string[]> }>;
  for (const [id, t] of Object.entries(topics)) {
    for (const l of ['en', 'hi', 'pa']) {
      assert.ok(t.do[l]!.length > 0, `${id}.${l}`);
      assert.equal(t.do[l]!.length, t.do.en!.length, `${id}.${l} step count`);
      assert.equal(t.dont[l]!.length, t.dont.en!.length, `${id}.${l} dont count`);
    }
  }
  for (const s of vocab.symptoms) if (s.firstAid) assert.ok(topics[s.firstAid], s.firstAid);
});

test('every symptom has labels + keywords in all 3 languages; model matches vocab', () => {
  for (const s of vocab.symptoms) for (const l of ['en', 'hi', 'pa'] as const) {
    assert.ok(s.label[l], `${s.id} label ${l}`);
    assert.ok(s.keywords[l].length, `${s.id} keywords ${l}`);
  }
  assert.deepEqual(model.features, [...vocab.symptoms.map((s) => s.id), ...vocab.modifiers]);
});

test('scheme rules: 70+ senior is likely eligible for PM-JAY; nobody else by default', () => {
  const r = evaluateOffline({ age_70_plus: true });
  assert.equal(r.source, 'offline_rules');
  assert.ok(r.results.find((x) => x.schemeId === 'pmjay')!.likelyEligible);
  assert.ok(evaluateOffline({}).results.every((x) => !x.likelyEligible));
  for (const s of BUNDLED_RULES.schemes) for (const c of s.anyOf) for (const q of c.all)
    assert.ok(BUNDLED_RULES.questions.some((x) => x.id === q), `${s.id}/${c.id} references unknown question ${q}`);
});
