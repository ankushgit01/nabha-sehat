import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/features/triage/classifier';
import { symptomIdsFromText, extractSymptoms } from '../src/features/triage/textToSymptoms';
import type { TriageModifiers } from '../src/db/types';

const adult: TriageModifiers = { age_group: 'adult', pregnant: false, duration_days: 1 };

test('red-flag symptom always classifies as emergency', async () => {
  for (const s of ['snake_bite', 'choking', 'bleeding_heavy', 'unconscious', 'poisoning', 'seizure']) {
    const r = await classify({ symptoms: [s], modifiers: adult });
    assert.equal(r.urgency, 'emergency', s);
  }
});

test('chest pain + breathlessness → emergency with first-aid topic', async () => {
  const r = await classify({ symptoms: ['chest_pain', 'breathlessness'], modifiers: adult });
  assert.equal(r.urgency, 'emergency');
  assert.ok(r.redFlags.includes('chest_pain_breathless'));
  assert.equal(r.adviceTopic, 'chest_pain');
});

test('common cold in adult → self care', async () => {
  const r = await classify({ symptoms: ['cold'], modifiers: adult });
  assert.equal(r.urgency, 'self_care');
});

test('high fever in a child is at least urgent', async () => {
  const r = await classify({ symptoms: ['high_fever'], modifiers: { ...adult, age_group: 'child' } });
  assert.ok(['urgent', 'emergency'].includes(r.urgency));
});

test('long cough → routine (TB screening path)', async () => {
  const r = await classify({ symptoms: ['cough'], modifiers: { ...adult, duration_days: 21 } });
  assert.equal(r.urgency, 'routine');
});

test('inference is fast (well under the 2–3 s budget)', async () => {
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) await classify({ symptoms: ['fever', 'cough', 'weakness'], modifiers: adult });
  const per = (performance.now() - t0) / 1000;
  assert.ok(per < 5, `per-inference ${per}ms`);
});

test('multilingual text extraction', () => {
  assert.deepEqual(symptomIdsFromText('mujhe bukhar hai aur khansi').sort(), ['cough', 'fever']);
  assert.deepEqual(symptomIdsFromText('मुझे तेज़ बुखार है और सिर दर्द'), ['high_fever', 'headache']);
  assert.deepEqual(symptomIdsFromText('ਮੈਨੂੰ ਬੁਖਾਰ ਅਤੇ ਖੰਘ ਹੈ').sort(), ['cough', 'fever']);
  assert.deepEqual(symptomIdsFromText('My father was bitten by a snake'), ['snake_bite']);
  assert.deepEqual(symptomIdsFromText('ਸੱਪ ਨੇ ਡੰਗ ਲਿਆ'), ['snake_bite']);
});

test('negation is respected', () => {
  const m = extractSymptoms('cough since 3 days, no fever');
  assert.ok(m.find((x) => x.symptomId === 'cough' && !x.negated));
  assert.ok(m.find((x) => x.symptomId === 'fever' && x.negated));
  assert.deepEqual(symptomIdsFromText('बुखार नहीं है, खांसी है'), ['cough']);
});
