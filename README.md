# Nabha Sehat — offline-first telemedicine for rural Punjab

A single Expo Router codebase for Android, iOS and web. It is built around one decision flow:

```
language → describe symptom (voice / text / body-part icons) → on-device urgency
   ├─ EMERGENCY → one-tap SOS (SMS + GPS, then call) + bundled first aid   [no network anywhere]
   └─ ROUTINE  → online: doctor (chat/audio/video) + Ayushman check
                 offline: queued request + safe self-care, auto-sync later
every encounter → local health record → syncs to MongoDB Atlas when online
```

> ⚠️ **Not for clinical use yet.** The triage rules, the training data, the first-aid text and the Hindi/Punjabi wording are **drafts**. A qualified medical advisor (and native speakers) must review them first. See the [review checklist](#medical--content-review-checklist). The app shows a "draft awaiting doctor review" banner until `firstAid.json → _review.status` is `APPROVED`.

---

## 1. Getting started

```bash
# App
npm install
npx expo install --fix          # IMPORTANT: aligns every expo-* / RN package to the exact SDK 57 versions
cp .env.example .env
eas build --profile development --platform android   # custom dev client (see §4 for why)
npm start                       # then open in the dev client
npm run web                     # web target, same code

# Backend
cd backend && npm install && cp .env.example .env    # fill MONGODB_URI (Atlas), JWT_SECRET, Twilio
npm run seed && npm run dev

# ML (retrain the triage model)
pip install -r ml/requirements.txt && python ml/train.py
```

**Version check (done Oct 2026):** Expo SDK 57 (June 30, 2026) ships RN 0.86 and React 19.2. Bug-fix releases matter: 57.0.9 fixed a Hermes memory regression and 57.0.17 fixed a startup regression, so the project pins `expo ~57.0.17`. This project was written in a sandbox with **no npm access**, so the `package.json` ranges for some third-party packages are best estimates. `npx expo install --fix` is the source of truth. Run it before anything else.

## 2. What was verified here, and what you still need to verify

| Verified in this sandbox | Result |
|---|---|
| `npm run test:core`: 25 tests covering sync/merge, SOS, triage, i18n/content parity and scheme rules | ✅ all pass |
| Strict `tsc` (`strict` + `noUncheckedIndexedAccess`) on every framework-independent module and its tests | ✅ 0 errors |
| esbuild syntax parse of all 77 TS/TSX files | ✅ 0 errors |
| `python ml/train.py` | ✅ acc 98.2%, emergency recall 99.7% (synthetic data, see §5) |
| `npm run bench:triage` | ✅ p99 ≈ 0.1 ms per inference on the dev machine |

**Not verified here** (it needs `npm install`, which was blocked): the full React Native type check, `jest-expo` component tests, the backend integration test (`backend/test/api.test.ts` runs on mongodb-memory-server), the Detox E2E tests and an on-device run. Run these first:

```bash
npm run typecheck && npm test && npm run test:core && (cd backend && npm run typecheck && npm test)
```

## 3. Architecture

```
app/                         expo-router screens (each file's header states its airplane-mode behaviour)
src/platform/                ← the ONLY place platform-specific modules are imported (enforced by ESLint)
  storage/LocalStore.ts        one interface → store.native.ts (expo-sqlite) | store.web.ts (IndexedDB) | memoryStore.ts
  voice.ts                     TTS (expo-speech) + STT (expo-speech-recognition), with availability checks
  telephony.ts / location.ts   native call/SMS hand-off, best-effort GPS with a hard timeout
src/components/map/          FacilityMap → Map.native.tsx (react-native-maps) | Map.web.tsx (Leaflet)
src/features/
  sync/                        merge.ts (pure rules, shared with backend) · syncEngine.ts · repository.ts · syncTriggers.ts
  triage/                      symptoms.json (vocab, shared with ml/) · classifier.ts · redFlags.ts · textToSymptoms.ts
  sos/                         sosService.ts (no network imports, enforced by a test)
  consultation/ schemes/ facilities/
src/assets/models/           triage_mlp_v1.json (27 KB)   src/assets/first-aid/firstAid.json (pa/hi/en)
backend/                     Express 5 + MongoDB driver + Twilio, imports src/features/sync/merge.ts
ml/                          labeling_rules.py + train.py → JSON weights (+ .tflite if TensorFlow is installed)
```

### Offline behaviour per screen (spec §10)

| Screen | Airplane mode |
|---|---|
| Language, onboarding, settings | Fully works. Registering needs the network, and the screen says so. |
| Symptom check | Icons, text and classification work fully. The mic works only where the OS has an on-device model for that language. If not, it says why and the other inputs remain. |
| Triage result | Fully works. The consult button changes to "Request a doctor (will send when online)". |
| **SOS** | **Fully works.** Local log, GPS, native SMS composer, native dialler, bundled first aid. |
| First aid | Fully works (bundled). |
| Consultation | The request is queued locally and shown as queued. Chat and video show "needs internet". Doctor notes that have already synced are visible. |
| Records | Fully works, including adding photos. Uploads happen on the next sync. |
| Ayushman check | Uses the bundled rules, labelled "based on general rules — confirm online". |
| Hospitals | The list and call buttons work. The map shows an explicit offline placeholder. |

### Sync protocol (spec §7) — `src/features/sync/merge.ts`

- **Client UUIDs**, so a push is an idempotent upsert. A lost acknowledgement plus a retry does not create a duplicate (tested).
- **Server timestamps** come from a monotonic Mongo counter (`max(stored, now) + 1`), so two writes never tie. The higher stamp wins (last-write-wins).
- The **loser is archived** to `record_history` and never silently discarded.
- **Pending local edits are never overwritten by a pull.** They are pushed first, then the server decides.
- **`sos_events` are append-only** on both sides. They cannot be deleted locally (the store throws), and a server copy can never overwrite a local one. Location and delivery fields can be filled in only before the server first acknowledges the event. **SOS logs must never be silently merged or dropped.**
- **Doctor-owned consultation fields** (status, notes, prescription, room) can only be written by the server.
- **Triggers:** app foreground, connectivity regained, and a debounced trigger after local writes. There is no background polling loop.
- **Anonymous users** keep everything `local_only`. When they register, their records are promoted and synced.

## 4. Native modules and the managed workflow (flagged, as spec §10 asks)

No eject and no bare workflow. Three features need native code that Expo Go doesn't include, so the project uses a **custom dev client built with EAS** from day one:

| Module | Why | Status (Oct 2026) |
|---|---|---|
| `expo-speech-recognition` | Voice input | Maintained, versioned with the Expo SDK (`^57`). Offline recognition depends on OS language models. Punjabi on-device support is rare, so icons and text stay primary. |
| `react-native-maps` | Native map | Needs a Google Maps key (EAS secret). Leaflet is used on web. |
| `react-native-fast-tflite` *(optional)* | Only if `EXPO_PUBLIC_TRIAGE_ENGINE=tflite` | v3.0.1 (Apr 2026), Nitro Modules, supports the new architecture and bridgeless mode. Preferred over `@tensorflow/tfjs-react-native`. |

`npx expo prebuild` (used only for Detox) generates `android/` and `ios/`, which are git-ignored. The project stays managed.

## 5. Triage model — deliberate change from spec §4

**What the spec asked for:** a TFLite model run via a native binding.
**What was built:** the same trained network (one-hot symptoms + 4 modifiers → Dense(32, ReLU) → Dense(4, softmax), about 1.3k parameters) ships as **27 KB of JSON weights and runs in plain TypeScript.**

**Why:** it needs no native module, works in Expo Go and on web, uses no WASM, and takes about 0.1 ms per inference (the budget is 2–3 s).

`ml/train.py` also exports an identical `.tflite` file when TensorFlow is installed. `tfliteEngine.native.ts` wires it behind the same `UrgencyEngine` interface. A native engine becomes worth it for future image models.

**Safety layer:** `redFlags.ts` applies deterministic rules after the model. These rules can only **escalate** urgency, never lower it. Examples: any red-flag symptom, chest pain with breathlessness, possible anaphylaxis, fever with confusion, a child with fever and breathlessness.

**Data honesty:** no labelled Punjab symptom→urgency dataset was available. The model is trained on cases synthesised from `ml/labeling_rules.py`, so **its accuracy figures only show that it learned those rules.** They are not clinical validation. To replace that data, label real de-identified triage records with clinicians and run `python ml/train.py --data cases.csv`. The report tracks **emergency recall** and the **under-triage rate**.

Every result is stored with `model_version` and `inference_ms`, and the result screen shows "checked on this phone in N ms". Read that on the 2 GB reference phone to measure success criterion #1 on real hardware.

## 6. Accessibility and localisation

- **Touch and labels:** touch targets are 56–96 dp, every action pairs an icon with text, and every action has an accessibility label.
- **Read-aloud:** long-pressing any tile reads it aloud. Read-aloud buttons are hidden when no TTS voice exists for the language. Punjabi `pa-IN` voices are often missing on low-end Android phones.
- **Display options:** adjustable text size (A / A+ / A++) and a high-contrast mode.
- **Urgency without colour:** urgency is shown by colour, icon and words together, so colour-blind users aren't excluded.
- **Fonts:** Noto Sans Gurmukhi and Noto Sans Devanagari are bundled, so nothing depends on OEM fonts. Line height is increased for matras. Still check rendering on a real low-end device and on web.
- **Language picker:** it works before the user can read. Each tile shows a script glyph and the language's native name, and tapping it speaks the name.
- **Adding a language:** add `src/i18n/locales/<code>.json` and one entry in `LANGUAGES`. `tests/content.test.ts` enforces key parity.

## 7. Privacy and security

- **Transport and secrets:** HTTPS only. Secrets go in `.env` / EAS secrets and are never committed. JWTs are signed server-side.
- **Rate limiting and logs:** OTP is rate-limited. Production logs redact the auth header and the request body.
- **Native storage encryption:** SQLCipher via expo-sqlite (`EXPO_PUBLIC_SQLCIPHER=1` plus `useSQLCipher` in the plugin). The key is kept in the OS keystore. It is off by default until it is measured on the reference device (about 3–4 MB extra). Settings shows whether it is on.
- **Web storage:** IndexedDB, which is **not** encrypted at rest. This is a browser limitation and Settings shows it.
- **Server-side access control:** records are scoped to their owner, and a push of another user's record is rejected. Only the owner or a doctor can fetch uploaded files.

## 8. Medical / content review checklist

- [ ] `ml/labeling_rules.py` and `src/features/triage/redFlags.ts`: every rule signed off.
- [ ] `src/features/triage/symptoms.json`: tier and red-flag status for each symptom, plus Hindi/Punjabi keywords checked by speakers from Nabha.
- [ ] `src/assets/first-aid/firstAid.json`: all 15 topics in all 3 languages. Then set `_review.status: "APPROVED"`, `approvedBy` and `approvedOn`.
- [ ] `src/features/schemes/rules.json`: check against current NHA and Punjab SHA rules. Punjab's scheme coverage changes often.
- [ ] `src/features/facilities/seed.json`: verified phone numbers and coordinates from the Patiala district health office. Until then the app falls back to 108.
- [ ] Replace the synthetic training data with clinician-labelled cases, retrain, and review the confusion matrix in `ml/report.json`.

## 9. Build and deploy

```bash
eas build --profile preview --platform android     # internal APK for field testing
eas build --profile production --platform all && eas submit
eas update --channel production                    # OTA JS updates (model and content JSON included)
npm run export:web                                  # static site in dist/; host anywhere
```

Because the model weights, first-aid content and rules are JSON bundled in the JS, **an EAS Update ships a reviewed content or model change without a store release.**

## 10. Known gaps / next steps

- **Video:** the provider is a stub (`createRoom` → Jitsi URL). Pick a provider that degrades well on 2G/3G.
- **Web push:** there is no web push for doctor replies. The patient sees replies on the next foreground or reconnect.
- **SMS on Android:** SMS opens the native composer, so the user taps Send. Fully silent sending needs the `SEND_SMS` permission, which is restricted by Play policy.
- **Eligibility:** the "live" check uses the latest server-side rules. There is no public NHA beneficiary-lookup API for third parties.
- **Doctor tools:** there is no doctor dashboard UI yet. The API exists under `/v1/doctor/*`.
