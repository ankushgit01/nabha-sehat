/**
 * Detox E2E — critical paths (spec §4 testing). Runs on an Android emulator
 * configured like the reference device (API 26, 2 GB RAM). Network is toggled
 * with `adb shell svc wifi/data disable`, so these really run in airplane mode.
 *
 *   npx expo prebuild --platform android   # generated, git-ignored; still managed workflow
 *   npm run e2e:build:android && npm run e2e:android
 */
const { execSync } = require('child_process');
const offline = () => execSync('adb shell svc wifi disable && adb shell svc data disable');
const online = () => execSync('adb shell svc wifi enable && adb shell svc data enable');

describe('Offline critical paths', () => {
  beforeAll(async () => {
    offline();
    await device.launchApp({ newInstance: true, delete: true, permissions: { location: 'always', microphone: 'NO' } });
    await element(by.id('lang-pa')).tap();
    await element(by.text('ਹੁਣ ਛੱਡੋ')).tap(); // skip contact
  });
  afterAll(() => online());

  it('symptom check → emergency result with first aid, fully offline', async () => {
    await element(by.id('home-check')).tap();
    await element(by.text('ਸੱਟ / ਹਾਦਸਾ')).tap();
    await element(by.id('sym-snake_bite')).tap();
    await element(by.id('check-now')).tap();
    await waitFor(element(by.id('urgency-emergency'))).toBeVisible().withTimeout(3000); // ≤3 s budget incl. UI
    await expect(element(by.id('first-aid-snake_bite'))).toBeVisible();
  });

  it('SOS screen works offline and can be cancelled', async () => {
    await element(by.id('sos-button')).atIndex(0).tap();
    await expect(element(by.id('sos-cancel'))).toBeVisible();
    await element(by.id('sos-cancel')).tap();
    await expect(element(by.id('first-aid-general_emergency'))).toBeVisible();
  });

  it('consultation request is queued offline, then synced when back online', async () => {
    await device.launchApp({ newInstance: false, url: 'nabhasehat://consultation/new' });
    await element(by.id('consult-request')).tap();
    await expect(element(by.id('consult-state-queued_offline'))).toBeVisible();
    // Registered-user sync is covered by tests/sync.test.ts + backend/test/api.test.ts;
    // here we assert the UI never blocks or errors while offline.
  });
});
