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

const K = {
  lang: 'pref.lang',
  onboarded: 'pref.onboarded',
  fontScale: 'pref.fontScale',
  contrast: 'pref.highContrast',
  deviceUser: 'id.deviceUser',
  auth: 'id.auth',
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
  signIn(a: Auth): Promise<void>;
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
      const [[, l], [, ob], [, fs], [, hc], [, du], [, au]] = await AsyncStorage.multiGet([
        K.lang,
        K.onboarded,
        K.fontScale,
        K.contrast,
        K.deviceUser,
        K.auth,
      ]);
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
    async signIn(a) {
      await AsyncStorage.setItem(K.auth, JSON.stringify(a));
      setAuth(a);
      authRef.current = a;
      identityRef.current = { userId: a.userId, registered: true };
      await promoteLocalOnly(store, a.userId);
      void syncNow();
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
