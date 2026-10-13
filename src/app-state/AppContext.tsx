/**
 * App-wide state: storage, repository, identity, settings, connectivity and sync.
 * Everything here initialises from local storage only — the app is fully usable
 * before (and without) any network request.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createStore } from '../platform/storage/store';
import type { LocalStore } from '../platform/storage/LocalStore';
import { createRepository, Repository } from '../features/sync/repository';
import { runSync, promoteLocalOnly, SyncReport } from '../features/sync/syncEngine';
import { startSyncTriggers } from '../features/sync/syncTriggers';
import { createApi, Api } from '../api/client';
import { initI18n, DEFAULT_LANG } from '../i18n';
import type { EmergencyContact, Facility, Lang } from '../db/types';
import facilitySeed from '../features/facilities/seed.json';
import Constants from 'expo-constants';
import { setEngine } from '../features/triage/classifier';
import { createTfliteEngine } from '../features/triage/tfliteEngine';
import { EMPTY_PROFILE, Profile } from '../features/profile/profile';
import type { AuthTokens } from '../api/client';

const K = {
  lang: 'pref.lang',
  onboarded: 'pref.onboarded',
  fontScale: 'pref.fontScale',
  contrast: 'pref.highContrast',
  deviceUser: 'id.deviceUser',
  auth: 'id.auth',
  profile: 'id.profile',
  profileDirty: 'id.profileDirty',
} as const;

interface Auth {
  token: string;
  userId: string;
  phone: string;
}

export interface AppState {
  ready: boolean;
  lang: Lang;
  setLang(l: Lang): Promise<void>;
  onboarded: boolean;
  completeOnboarding(): Promise<void>;
  fontScale: number;
  setFontScale(n: number): Promise<void>;
  highContrast: boolean;
  setHighContrast(v: boolean): Promise<void>;
  store: LocalStore;
  repo: Repository;
  api: Api;
  userId: string;
  auth: Auth | null;
  signIn(a: AuthTokens): Promise<void>;
  signOut(): Promise<void>;
  /** Patient profile (name, age, gender, …). Saved on the phone first, synced when online. */
  profile: Profile | null;
  saveProfile(p: Profile): Promise<void>;
  online: boolean;
  syncing: boolean;
  lastSync: SyncReport | null;
  syncNow(): Promise<void>;
  contacts: EmergencyContact[];
  saveContact(c: Omit<EmergencyContact, 'id'> & { id?: string }): Promise<void>;
  facilities: Facility[];
  newId(): string;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

const newId = () => Crypto.randomUUID();

export function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => createStore(), []);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [onboarded, setOnboarded] = useState(false);
  const [fontScale, setFontScaleState] = useState(1);
  const [highContrast, setHC] = useState(false);
  const [deviceUserId, setDeviceUserId] = useState('');
  const [auth, setAuth] = useState<Auth | null>(null);
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>(facilitySeed.facilities as Facility[]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;

  const authRef = useRef<Auth | null>(null);
  authRef.current = auth;
  const api = useMemo(() => createApi(() => authRef.current?.token ?? null), []);
  const triggers = useRef<ReturnType<typeof startSyncTriggers> | null>(null);

  const userId = auth?.userId ?? deviceUserId;
  const identityRef = useRef({ userId, registered: !!auth });
  identityRef.current = { userId, registered: !!auth };

  const repo = useMemo(
    () =>
      createRepository({
        store,
        newId,
        identity: () => identityRef.current,
        onLocalWrite: () => triggers.current?.soon(),
      }),
    [store],
  );

  const syncNow = useCallback(async () => {
    if (!authRef.current) return; // anonymous: local only
    setSyncing(true);
    try {
      // Push a profile edited while offline.
      if ((await AsyncStorage.getItem(K.profileDirty)) === '1' && profileRef.current) {
        try {
          await api.me.put(profileRef.current);
          await AsyncStorage.removeItem(K.profileDirty);
        } catch {
          /* retry next sync */
        }
      }
      const r = await runSync(store, api.sync);
      setLastSync(r);
      // Refresh facility directory opportunistically (cached for offline use).
      try {
        const list = await api.facilities.list();
        if (list.length) {
          await store.putMany('facilities', list);
          setFacilities(list);
        }
      } catch {
        /* keep cached */
      }
    } finally {
      setSyncing(false);
    }
  }, [store, api]);

  // Boot: everything from local storage.
  useEffect(() => {
    (async () => {
      await store.init();
      const [[, l], [, ob], [, fs], [, hc], [, du], [, au], [, pr]] = await AsyncStorage.multiGet([
        K.lang,
        K.onboarded,
        K.fontScale,
        K.contrast,
        K.deviceUser,
        K.auth,
        K.profile,
      ]);
      if (pr) setProfile({ ...EMPTY_PROFILE, ...(JSON.parse(pr) as Partial<Profile>) });
      const language = (l as Lang | null) ?? DEFAULT_LANG;
      initI18n(language);
      setLangState(language);
      setOnboarded(ob === '1');
      setFontScaleState(fs ? Number(fs) : 1);
      setHC(hc === '1');
      let dev = du;
      if (!dev) {
        dev = newId();
        await AsyncStorage.setItem(K.deviceUser, dev);
      }
      setDeviceUserId(dev);
      if (au) setAuth(JSON.parse(au) as Auth);

      if (Constants.expoConfig?.extra?.triageEngine === 'tflite') {
        // Optional native engine; any failure silently keeps the bundled JS engine.
        await createTfliteEngine().then(setEngine).catch(() => undefined);
      }
      setContacts(await store.list<EmergencyContact>('emergency_contacts'));
      const cached = await store.list<Facility>('facilities');
      if (cached.length) setFacilities(cached);
      else await store.putMany('facilities', facilitySeed.facilities as Facility[]);
      setReady(true);
    })();
  }, [store]);

  useEffect(() => {
    if (!ready) return;
    triggers.current = startSyncTriggers({ onOnlineChange: setOnline, sync: () => void syncNow() });
    return () => triggers.current?.stop();
  }, [ready, syncNow]);

  const value: AppState = {
    ready,
    lang,
    async setLang(l) {
      initI18n(l);
      setLangState(l);
      await AsyncStorage.setItem(K.lang, l);
    },
    onboarded,
    async completeOnboarding() {
      setOnboarded(true);
      await AsyncStorage.setItem(K.onboarded, '1');
    },
    fontScale,
    async setFontScale(n) {
      setFontScaleState(n);
      await AsyncStorage.setItem(K.fontScale, String(n));
    },
    highContrast,
    async setHighContrast(v) {
      setHC(v);
      await AsyncStorage.setItem(K.contrast, v ? '1' : '0');
    },
    store,
    repo,
    api,
    userId,
    auth,
    async signIn(t) {
      const a: Auth = { token: t.token, userId: t.userId, phone: t.phone };
      await AsyncStorage.setItem(K.auth, JSON.stringify(a));
      setAuth(a);
      authRef.current = a;
      identityRef.current = { userId: a.userId, registered: true };
      // Returning user on a new phone: adopt the profile saved on the server if we have none.
      const server = t.profile;
      const local = profileRef.current;
      const localEmpty = !local || (!local.name && local.age === null && !local.gender);
      if (server && localEmpty && (server.name || server.age != null || server.gender)) {
        const merged: Profile = { ...EMPTY_PROFILE, ...(server as Partial<Profile>), conditions: server.conditions ?? [] };
        setProfile(merged);
        profileRef.current = merged;
        await AsyncStorage.setItem(K.profile, JSON.stringify(merged));
      } else if (local) {
        await AsyncStorage.setItem(K.profileDirty, '1');
      }
      await promoteLocalOnly(store, a.userId);
      void syncNow();
    },
    async signOut() {
      // Records stay on this phone (they are the patient's safety history); only the login is removed.
      await AsyncStorage.removeItem(K.auth);
      setAuth(null);
      authRef.current = null;
      identityRef.current = { userId: deviceUserId, registered: false };
    },
    profile,
    async saveProfile(p) {
      // Local first (works offline), then server if possible.
      setProfile(p);
      profileRef.current = p;
      await AsyncStorage.setItem(K.profile, JSON.stringify(p));
      const now = new Date().toISOString();
      await store.put('users', {
        id: authRef.current?.userId ?? deviceUserId,
        phone: authRef.current?.phone ?? null,
        ...p,
        preferred_language: lang,
        registration_status: authRef.current ? 'registered' : 'anonymous',
        created_at: now,
        updated_at: now,
      });
      await AsyncStorage.setItem(K.profileDirty, '1');
      if (authRef.current && online) {
        try {
          await api.me.put({ ...p, preferred_language: lang });
          await AsyncStorage.removeItem(K.profileDirty);
        } catch {
          /* stays dirty; pushed on next sync */
        }
      }
    },
    online,
    syncing,
    lastSync,
    syncNow,
    contacts,
    async saveContact(c) {
      const rec = { id: c.id ?? newId(), name: c.name, phone: c.phone, relation: c.relation ?? null };
      await store.put('emergency_contacts', rec);
      setContacts(await store.list<EmergencyContact>('emergency_contacts'));
    },
    facilities,
    newId,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
