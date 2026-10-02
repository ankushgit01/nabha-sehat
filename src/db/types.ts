/**
 * Shared record shapes. Field names are identical in SQLite (local) and
 * MongoDB (cloud) so the sync layer maps 1:1 (spec §6).
 */

export type SyncStatus = 'local_only' | 'pending' | 'synced' | 'conflict';
export type Lang = 'pa' | 'hi' | 'en';
export type UrgencyTier = 'emergency' | 'urgent' | 'routine' | 'self_care';

/** Columns every syncable record carries. */
export interface SyncMeta {
  /** Client-generated UUID v4, assigned at creation — never by the server (spec §7). */
  id: string;
  user_id: string;
  /** Client wall-clock ISO time of last local edit (informational only). */
  updated_at: string;
  created_at: string;
  /** Authoritative server timestamp (ms since epoch) of the last accepted write; null until first sync. */
  server_updated_at: number | null;
  sync_status: SyncStatus;
  /** Human-readable reason when sync_status === 'conflict'. */
  sync_error?: string | null;
}

export interface User {
  id: string;
  phone: string | null;
  name: string | null;
  preferred_language: Lang;
  registration_status: 'anonymous' | 'registered';
  created_at: string;
  updated_at: string;
}

export interface SymptomLog extends SyncMeta {
  input_text: string | null;
  /** Speech transcript, if the user spoke. */
  transcript: string | null;
  input_language: Lang;
  selected_symptoms: string[];
  /** Age group / pregnancy modifiers captured during intake. */
  modifiers: TriageModifiers;
  urgency: UrgencyTier;
  confidence: number;
  concern_areas: string[];
  /** Red-flag rule ids that forced an escalation, if any. */
  red_flags: string[];
  model_version: string;
  inference_ms: number;
  advice_topic: string | null;
}

export interface TriageModifiers {
  age_group: 'child' | 'adult' | 'elderly';
  pregnant: boolean;
  duration_days: number;
}

export type ConsultationMode = 'chat' | 'audio' | 'video';
export type ConsultationStatus = 'queued' | 'waiting' | 'active' | 'completed' | 'cancelled';

export interface Consultation extends SyncMeta {
  symptom_log_id: string | null;
  mode: ConsultationMode;
  status: ConsultationStatus;
  patient_note: string | null;
  /** Server-owned fields below: the client never overwrites them (see sync/merge.ts). */
  doctor_id: string | null;
  doctor_name: string | null;
  notes: string | null;
  prescription: string | null;
  room_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface SosEvent extends SyncMeta {
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  location_error: string | null;
  reported_symptom: string | null;
  contacted_numbers: string[];
  sms_status: 'sent' | 'cancelled' | 'unavailable' | 'failed' | 'not_attempted';
  call_status: 'dialled' | 'unavailable' | 'failed' | 'not_attempted';
}

export interface HealthRecord extends SyncMeta {
  type: 'symptom_log' | 'consultation' | 'document' | 'sos_event';
  reference_id: string | null;
  title: string;
  /** Local file URI (device) — uploaded separately; cloud copy lives in file_remote_url. */
  file_uri: string | null;
  file_remote_url: string | null;
  mime_type: string | null;
  summary: string | null;
}

export interface Facility {
  id: string;
  name: string;
  name_local: Partial<Record<Lang, string>>;
  type: 'civil_hospital' | 'chc' | 'phc' | 'subcentre' | 'private' | 'ambulance';
  latitude: number;
  longitude: number;
  services: string[];
  phone: string | null;
  address: string;
  /** Data-quality flag: unverified entries are shown with a warning. */
  verified: boolean;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
}

export type SyncTable = 'symptom_logs' | 'consultations' | 'sos_events' | 'health_records';
export const SYNC_TABLES: SyncTable[] = ['symptom_logs', 'consultations', 'sos_events', 'health_records'];

export type SyncRecord = SymptomLog | Consultation | SosEvent | HealthRecord;
export interface RecordByTable {
  symptom_logs: SymptomLog;
  consultations: Consultation;
  sos_events: SosEvent;
  health_records: HealthRecord;
}
