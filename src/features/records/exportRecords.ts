/**
 * "Export my records" — builds ONE CSV of everything this phone holds (works offline).
 * Each row = one encounter; the patient's profile is repeated on every row so the
 * file still makes sense if a doctor sorts or filters it in Excel / Google Sheets.
 */
import type { LocalStore } from '../../platform/storage/LocalStore';
import type { Consultation, HealthRecord, SosEvent, SymptomLog } from '../../db/types';
import type { Profile } from '../profile/profile';
import { toCsv } from './csv';

export const MY_RECORDS_COLUMNS = [
  'date',
  'type',
  'urgency_or_status',
  'symptoms_or_title',
  'details',
  'doctor_note',
  'prescription',
  'location',
  'saved_status',
  'patient_name',
  'phone',
  'age',
  'gender',
  'village',
  'blood_group',
  'conditions',
  'record_id',
];

export async function buildMyRecordsCsv(
  store: LocalStore,
  who: { profile: Profile | null; phone: string | null },
  label: (symptomId: string) => string = (s) => s,
): Promise<{ csv: string; count: number }> {
  const p = who.profile;
  const base = {
    patient_name: p?.name ?? '',
    phone: who.phone ?? '',
    age: p?.age ?? '',
    gender: p?.gender ?? '',
    village: p?.village ?? '',
    blood_group: p?.blood_group ?? '',
    conditions: p?.conditions ?? [],
  };
  const rows: Record<string, unknown>[] = [];

  for (const s of await store.list<SymptomLog>('symptom_logs')) {
    rows.push({
      ...base,
      date: s.created_at,
      type: 'symptom_check',
      urgency_or_status: s.urgency,
      symptoms_or_title: s.selected_symptoms.map(label),
      details: [s.input_text, s.transcript].filter(Boolean).join(' | '),
      saved_status: s.sync_status,
      record_id: s.id,
    });
  }
  for (const c of await store.list<Consultation>('consultations')) {
    rows.push({
      ...base,
      date: c.created_at,
      type: `consultation_${c.mode}`,
      urgency_or_status: c.status,
      symptoms_or_title: c.doctor_name ?? '',
      details: c.patient_note ?? '',
      doctor_note: c.notes ?? '',
      prescription: c.prescription ?? '',
      saved_status: c.sync_status,
      record_id: c.id,
    });
  }
  for (const e of await store.list<SosEvent>('sos_events')) {
    rows.push({
      ...base,
      date: e.created_at,
      type: 'sos',
      urgency_or_status: `sms:${e.sms_status} call:${e.call_status}`,
      symptoms_or_title: e.reported_symptom ?? '',
      details: `contacted ${e.contacted_numbers.join(', ')}`,
      location: e.latitude != null ? `${e.latitude},${e.longitude}` : e.location_error ?? '',
      saved_status: e.sync_status,
      record_id: e.id,
    });
  }
  for (const d of await store.list<HealthRecord>('health_records', { where: { type: 'document' } })) {
    rows.push({
      ...base,
      date: d.created_at,
      type: 'document',
      symptoms_or_title: d.title,
      details: d.file_remote_url ?? d.file_uri ?? '',
      saved_status: d.sync_status,
      record_id: d.id,
    });
  }
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { csv: toCsv(MY_RECORDS_COLUMNS, rows as never), count: rows.length };
}
