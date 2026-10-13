/**
 * Patient profile captured at login. Pure helpers (validation, age group) shared
 * by the app and tests. Only `phone` is needed to log in; everything else is
 * optional so nobody is blocked from care by a form.
 */
import type { TriageModifiers } from '../../db/types';

export type Gender = 'male' | 'female' | 'other';

export interface Profile {
  name: string | null;
  age: number | null;
  gender: Gender | null;
  village: string | null;
  blood_group: string | null;
  /** Long-term conditions, ids from CONDITIONS. */
  conditions: string[];
  allergies: string | null;
}

export const EMPTY_PROFILE: Profile = {
  name: null,
  age: null,
  gender: null,
  village: null,
  blood_group: null,
  conditions: [],
  allergies: null,
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const CONDITIONS = ['diabetes', 'blood_pressure', 'heart', 'asthma', 'tb', 'pregnant', 'kidney', 'none'] as const;

/** Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX) or return null. */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export function validateProfile(p: Profile): Record<string, string> {
  const errors: Record<string, string> = {};
  if (p.age !== null && (!Number.isInteger(p.age) || p.age < 0 || p.age > 120)) errors.age = 'invalid_age';
  if (p.name && p.name.length > 80) errors.name = 'too_long';
  if (p.blood_group && !(BLOOD_GROUPS as readonly string[]).includes(p.blood_group)) errors.blood_group = 'invalid';
  return errors;
}

/** Default triage modifiers from the profile (the user can still change them per check). */
export function defaultModifiers(p: Profile | null): TriageModifiers {
  const age = p?.age ?? null;
  return {
    age_group: age === null ? 'adult' : age < 12 ? 'child' : age >= 60 ? 'elderly' : 'adult',
    pregnant: !!p && p.gender === 'female' && p.conditions.includes('pregnant'),
    duration_days: 1,
  };
}
