import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { csvCell, toCsv, EXPORT_COLUMNS } from '../src/features/records/csv';
import { normalisePhone, validateProfile, defaultModifiers, EMPTY_PROFILE } from '../src/features/profile/profile';
import { buildMyRecordsCsv, MY_RECORDS_COLUMNS } from '../src/features/records/exportRecords';
import { createMemoryStore } from '../src/platform/storage/memoryStore';
import { createRepository } from '../src/features/sync/repository';

test('csv quoting, arrays, unicode and formula-injection guard', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(['fever', 'cough']), 'fever; cough');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+919876543210'), '+919876543210', 'phone numbers are not mangled');
  assert.equal(csvCell(-3.5), '-3.5');
  assert.equal(csvCell(null), '');
  const out = toCsv(['name', 'village'], [{ name: 'ਗੁਰਪ੍ਰੀਤ', village: 'Bhadson' }]);
  assert.ok(out.startsWith('﻿name,village\r\n'), 'UTF-8 BOM so Excel shows Gurmukhi');
  assert.ok(out.includes('ਗੁਰਪ੍ਰੀਤ,Bhadson'));
});

test('phone normalisation (India)', () => {
  assert.equal(normalisePhone('98765 43210'), '+919876543210');
  assert.equal(normalisePhone('+91-9876543210'), '+919876543210');
  assert.equal(normalisePhone('09876543210'), '+919876543210');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone('1234567890'), null, 'Indian mobiles start with 6-9');
});

test('profile validation and triage defaults from age/gender', () => {
  assert.deepEqual(validateProfile({ ...EMPTY_PROFILE, age: 150 }), { age: 'invalid_age' });
  assert.deepEqual(validateProfile({ ...EMPTY_PROFILE, age: 34 }), {});
  assert.equal(defaultModifiers({ ...EMPTY_PROFILE, age: 5 }).age_group, 'child');
  assert.equal(defaultModifiers({ ...EMPTY_PROFILE, age: 70 }).age_group, 'elderly');
  assert.equal(defaultModifiers({ ...EMPTY_PROFILE, age: 30, gender: 'female', conditions: ['pregnant'] }).pregnant, true);
  assert.equal(defaultModifiers({ ...EMPTY_PROFILE, age: 30, gender: 'male', conditions: ['pregnant'] }).pregnant, false);
  assert.equal(defaultModifiers(null).age_group, 'adult');
});

test('export columns cover age and gender everywhere', () => {
  for (const cols of Object.values(EXPORT_COLUMNS)) {
    assert.ok((cols as readonly string[]).includes('gender'));
    assert.ok((cols as readonly string[]).includes('age'));
  }
});

test('"Export my records" builds one CSV with profile on every row (offline)', async () => {
  const store = createMemoryStore();
  const repo = createRepository({ store, newId: randomUUID, identity: () => ({ userId: 'u1', registered: false }) });
  await repo.create('symptom_logs', {
    input_text: 'bukhar', transcript: null, input_language: 'pa', selected_symptoms: ['fever'],
    modifiers: { age_group: 'adult', pregnant: false, duration_days: 2 }, urgency: 'self_care', confidence: 0.9,
    concern_areas: ['infection'], red_flags: [], model_version: 'triage-mlp-1', inference_ms: 0.1, advice_topic: 'fever',
  });
  await repo.create('sos_events', {
    latitude: 30.37, longitude: 76.15, location_accuracy_m: 10, location_error: null, reported_symptom: 'Snake bite',
    contacted_numbers: ['108'], sms_status: 'sent', call_status: 'dialled',
  });
  const { csv, count } = await buildMyRecordsCsv(
    store,
    { profile: { ...EMPTY_PROFILE, name: 'Gurpreet', age: 34, gender: 'female', village: 'Bhadson' }, phone: '+919876543210' },
    (id) => (id === 'fever' ? 'Fever' : id),
  );
  assert.equal(count, 2);
  const lines = csv.replace(/\r\n$/, '').split('\r\n');
  assert.equal(lines[0], '﻿' + MY_RECORDS_COLUMNS.join(','));
  assert.ok(lines.slice(1).every((l) => l.includes('Gurpreet') && l.includes('female') && l.includes('+919876543210')));
  assert.ok(csv.includes('Fever'));
  assert.ok(csv.includes('30.37,76.15') || csv.includes('"30.37,76.15"'));
});
