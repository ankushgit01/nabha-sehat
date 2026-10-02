/**
 * Voice I/O - the ONE interface for speech. TTS via expo-speech (works in Expo Go).
 * STT via expo-speech-recognition, only when its native module exists (NOT in Expo Go);
 * otherwise the mic button is disabled with a hint and icons/text remain the input.
 */
import * as Speech from 'expo-speech';
import { requireOptionalNativeModule } from 'expo';
import type { Lang } from '../db/types';

export const LOCALE: Record<Lang, string> = { pa: 'pa-IN', hi: 'hi-IN', en: 'en-IN' };

type SR = typeof import('expo-speech-recognition');
let sr: SR | null | undefined;
function speechRecognition(): SR | null {
  if (sr === undefined) {
    sr = null;
    if (requireOptionalNativeModule('ExpoSpeechRecognition')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sr = require('expo-speech-recognition') as SR;
      } catch {
        sr = null;
      }
    }
  }
  return sr;
}

const voiceCache = new Map<Lang, boolean>();

export async function canSpeak(lang: Lang): Promise<boolean> {
  if (voiceCache.has(lang)) return voiceCache.get(lang)!;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = LOCALE[lang].slice(0, 2);
    const ok = voices.length === 0 ? lang !== 'pa' : voices.some((v) => v.language?.toLowerCase().startsWith(prefix));
    voiceCache.set(lang, ok);
    return ok;
  } catch {
    voiceCache.set(lang, false);
    return false;
  }
}

export function speak(text: string, lang: Lang, opts?: { onDone?: () => void }) {
  Speech.stop();
  Speech.speak(text, { language: LOCALE[lang], rate: 0.9, onDone: opts?.onDone, onError: opts?.onDone });
}

export function stopSpeaking() {
  Speech.stop();
}

export interface SttAvailability {
  available: boolean;
  onDevice: boolean;
  reason?: 'no_module' | 'no_service' | 'needs_network' | 'permission_denied';
}

export async function sttAvailability(lang: Lang, online: boolean): Promise<SttAvailability> {
  const m = speechRecognition();
  if (!m) return { available: false, onDevice: false, reason: 'no_module' };
  try {
    const mod = m.ExpoSpeechRecognitionModule;
    if (!mod.isRecognitionAvailable()) return { available: false, onDevice: false, reason: 'no_service' };
    const onDevice = mod.supportsOnDeviceRecognition();
    if (!online && !onDevice) return { available: false, onDevice: false, reason: 'needs_network' };
    if (!online && onDevice) {
      const { installedLocales } = await mod.getSupportedLocales({});
      const has = installedLocales.some((l: string) => l.toLowerCase().startsWith(LOCALE[lang].slice(0, 2)));
      if (!has) return { available: false, onDevice: false, reason: 'needs_network' };
    }
    return { available: true, onDevice };
  } catch {
    return { available: false, onDevice: false, reason: 'no_service' };
  }
}

export interface ListenHandle {
  stop(): void;
}

export async function listen(
  lang: Lang,
  online: boolean,
  cb: { onPartial: (t: string) => void; onFinal: (t: string) => void; onError: (code: string) => void },
): Promise<ListenHandle | null> {
  const m = speechRecognition();
  if (!m) {
    cb.onError('no_module');
    return null;
  }
  const mod = m.ExpoSpeechRecognitionModule;
  const perm = await mod.requestPermissionsAsync();
  if (!perm.granted) {
    cb.onError('permission_denied');
    return null;
  }
  const subs = [
    mod.addListener('result', (e: { isFinal: boolean; results: { transcript: string }[] }) => {
      const t = e.results[0]?.transcript ?? '';
      if (e.isFinal) cb.onFinal(t);
      else cb.onPartial(t);
    }),
    mod.addListener('error', (e: { error: string }) => cb.onError(e.error)),
    mod.addListener('end', () => subs.forEach((s) => s.remove())),
  ];
  mod.start({ lang: LOCALE[lang], interimResults: true, continuous: false, requiresOnDeviceRecognition: !online, addsPunctuation: false });
  return { stop: () => mod.stop() };
}
