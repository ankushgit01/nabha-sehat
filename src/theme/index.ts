/**
 * Design system: react-native-paper (MD3), applied everywhere — no second UI kit.
 * Large type, 56dp+ touch targets (above the 44pt minimum), urgency colours that
 * are ALSO distinguished by icon + text so colour-blind users aren't excluded.
 */
import { MD3LightTheme, MD3DarkTheme, configureFonts, type MD3Theme } from 'react-native-paper';
import type { UrgencyTier } from '../db/types';

export const TOUCH = { min: 56, large: 72, sos: 96 } as const;

export const URGENCY: Record<UrgencyTier, { color: string; onColor: string; icon: string }> = {
  emergency: { color: '#B00020', onColor: '#FFFFFF', icon: 'alarm-light' },
  urgent: { color: '#E65100', onColor: '#FFFFFF', icon: 'hospital-building' },
  routine: { color: '#F9A825', onColor: '#1A1A1A', icon: 'stethoscope' },
  self_care: { color: '#2E7D32', onColor: '#FFFFFF', icon: 'home-heart' },
};

export function buildTheme(opts: { fontFamily?: string; fontScale: number; highContrast: boolean; dark: boolean }): MD3Theme {
  const base = opts.dark ? MD3DarkTheme : MD3LightTheme;
  const scaled = Object.fromEntries(
    Object.entries(base.fonts).map(([k, v]) => {
      const f = v as { fontSize: number; lineHeight: number };
      return [
        k,
        {
          ...v,
          ...(opts.fontFamily ? { fontFamily: opts.fontFamily } : {}),
          // +15% baseline for low-vision / low-literacy users, then the user's own scale.
          fontSize: Math.round(f.fontSize * 1.15 * opts.fontScale),
          // Gurmukhi/Devanagari have tall matras; extra line height prevents clipping.
          lineHeight: Math.round(f.lineHeight * 1.3 * opts.fontScale),
        },
      ];
    }),
  );
  const colors = opts.highContrast
    ? {
        ...base.colors,
        primary: opts.dark ? '#FFFF00' : '#000000',
        onPrimary: opts.dark ? '#000000' : '#FFFFFF',
        background: opts.dark ? '#000000' : '#FFFFFF',
        surface: opts.dark ? '#000000' : '#FFFFFF',
        onSurface: opts.dark ? '#FFFFFF' : '#000000',
        outline: opts.dark ? '#FFFFFF' : '#000000',
      }
    : { ...base.colors, primary: '#00695C', secondary: '#5D4037' };
  return { ...base, roundness: 4, colors, fonts: configureFonts({ config: scaled as never }) };
}
