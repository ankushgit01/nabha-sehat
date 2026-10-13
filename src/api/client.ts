/**
 * Typed backend client. Only ever called from the online path or the sync worker;
 * no screen awaits it for data the device already has.
 */
import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import type { Consultation, Facility } from '../db/types';
import type { PullResponse, PushItem, PushResultItem, SyncApi } from '../features/sync/syncEngine';
import type { Answers, EligibilityOutcome, RuleSet } from '../features/schemes/eligibility';
import type { Profile } from '../features/profile/profile';

const BASE_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'https://api.example.org';

export interface AuthTokens {
  token: string;
  userId: string;
  phone: string;
  role?: string;
  profile?: (Partial<Profile> & { id: string; phone: string | null }) | null;
}

export function createApi(getToken: () => string | null) {
  const http: AxiosInstance = axios.create({ baseURL: `${BASE_URL}/v1`, timeout: 15_000 });
  http.interceptors.request.use((cfg) => {
    const t = getToken();
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
  });

  const sync: SyncApi = {
    async push(items: PushItem[]) {
      return (await http.post<{ results: PushResultItem[] }>('/sync/push', { items })).data.results;
    },
    async pull(since: number) {
      return (await http.get<PullResponse>('/sync/pull', { params: { since } })).data;
    },
    async uploadFile(localUri, mime, recordId) {
      const form = new FormData();
      // React Native FormData file shape
      form.append('file', { uri: localUri, name: recordId, type: mime ?? 'application/octet-stream' } as never);
      form.append('recordId', recordId);
      return (await http.post<{ url: string }>('/files', form, { headers: { 'Content-Type': 'multipart/form-data' } }))
        .data.url;
    },
  };

  return {
    sync,
    auth: {
      /** In demo mode the server returns the code so the app can display it. */
      requestOtp: async (phone: string) =>
        (await http.post<{ ok: boolean; mode: string; demoCode?: string }>('/auth/otp/request', { phone })).data,
      verifyOtp: async (phone: string, code: string, deviceUserId: string) =>
        (await http.post<AuthTokens>('/auth/otp/verify', { phone, code, deviceUserId })).data,
    },
    me: {
      get: async () => (await http.get<{ profile: Partial<Profile> }>('/me')).data.profile,
      put: async (p: Partial<Profile> & { preferred_language?: string }) =>
        (await http.put<{ profile: Partial<Profile> }>('/me', p)).data.profile,
    },
    consultations: {
      queueStatus: async (id: string) =>
        (await http.get<{ position: number; consultation: Consultation }>(`/consultations/${id}/queue`)).data,
      availability: async () => (await http.get<{ doctorsOnline: number; waiting: number }>('/consultations/availability')).data,
      sendMessage: (id: string, text: string) => http.post(`/consultations/${id}/messages`, { text }),
      messages: async (id: string) =>
        (await http.get<{ messages: { id: string; from: 'patient' | 'doctor'; text: string; at: string }[] }>(
          `/consultations/${id}/messages`,
        )).data.messages,
    },
    schemes: {
      check: async (answers: Answers) => (await http.post<EligibilityOutcome>('/schemes/eligibility', { answers })).data,
      rules: async () => (await http.get<RuleSet>('/schemes/rules')).data,
    },
    facilities: {
      list: async () => (await http.get<{ facilities: Facility[] }>('/facilities')).data.facilities,
    },
  };
}

export type Api = ReturnType<typeof createApi>;
