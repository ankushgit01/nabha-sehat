/**
 * CSV writer shared by the app ("Export my records") and the backend admin export.
 * Pure, dependency-free. RFC 4180 quoting, UTF-8 BOM so Excel shows Gurmukhi /
 * Devanagari correctly, and spreadsheet formula-injection protection (cells that
 * start with = + - @ are prefixed with ').
 */

export type Cell = string | number | boolean | null | undefined | object;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (Array.isArray(v)) s = v.map((x) => (x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ');
  else s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, Cell>[], opts: { bom?: boolean } = {}): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return (opts.bom === false ? '' : '﻿') + lines.join('\r\n') + '\r\n';
}

/** Column sets used for exports — the same on phone and server. */
export const EXPORT_COLUMNS = {
  users: ['id', 'phone', 'name', 'age', 'gender', 'village', 'blood_group', 'conditions', 'allergies', 'preferred_language', 'registration_status', 'created_at', 'updated_at'],
  symptom_logs: ['id', 'created_at', 'user_id', 'phone', 'name', 'age', 'gender', 'village', 'selected_symptoms', 'input_text', 'transcript', 'urgency', 'confidence', 'concern_areas', 'red_flags', 'modifiers', 'model_version', 'sync_status'],
  consultations: ['id', 'created_at', 'user_id', 'phone', 'name', 'age', 'gender', 'mode', 'status', 'patient_note', 'doctor_name', 'notes', 'prescription', 'completed_at', 'sync_status'],
  sos_events: ['id', 'created_at', 'user_id', 'phone', 'name', 'age', 'gender', 'reported_symptom', 'latitude', 'longitude', 'location_error', 'contacted_numbers', 'sms_status', 'call_status', 'sync_status'],
} as const;

export type ExportTable = keyof typeof EXPORT_COLUMNS;
