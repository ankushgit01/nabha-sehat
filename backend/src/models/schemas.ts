/**
 * MongoDB $jsonSchema validators — same field names as src/db/schema.ts (SQLite).
 * validationLevel 'moderate' so older documents don't block schema evolution.
 */
type S = Record<string, unknown>;
const str = { bsonType: ['string'] };
const strN = { bsonType: ['string', 'null'] };
const num = { bsonType: ['double', 'int', 'long', 'decimal'] };
const numN = { bsonType: ['double', 'int', 'long', 'decimal', 'null'] };
const arr = { bsonType: 'array' };
const syncStatus = { enum: ['local_only', 'pending', 'synced', 'conflict'] };

const syncBase: S = {
  _id: str,
  user_id: str,
  created_at: str,
  updated_at: str,
  server_updated_at: num,
  sync_status: syncStatus,
};
const required = ['_id', 'user_id', 'created_at', 'server_updated_at'];

export const validators: Record<string, S> = {
  users: {
    bsonType: 'object',
    required: ['_id', 'registration_status'],
    properties: {
      _id: str,
      phone: strN,
      name: strN,
      preferred_language: { enum: ['pa', 'hi', 'en'] },
      registration_status: { enum: ['anonymous', 'registered'] },
      role: { enum: ['patient', 'doctor', 'admin'] },
    },
  },
  symptom_logs: {
    bsonType: 'object',
    required: [...required, 'urgency', 'model_version'],
    properties: {
      ...syncBase,
      selected_symptoms: arr,
      urgency: { enum: ['emergency', 'urgent', 'routine', 'self_care'] },
      confidence: num,
      model_version: str,
    },
  },
  consultations: {
    bsonType: 'object',
    required: [...required, 'mode', 'status'],
    properties: {
      ...syncBase,
      mode: { enum: ['chat', 'audio', 'video'] },
      status: { enum: ['queued', 'waiting', 'active', 'completed', 'cancelled'] },
      doctor_id: strN,
      notes: strN,
      prescription: strN,
    },
  },
  sos_events: {
    bsonType: 'object',
    required: [...required, 'contacted_numbers'],
    properties: { ...syncBase, latitude: numN, longitude: numN, contacted_numbers: arr },
  },
  health_records: {
    bsonType: 'object',
    required: [...required, 'type'],
    properties: { ...syncBase, type: { enum: ['symptom_log', 'consultation', 'document', 'sos_event'] } },
  },
  facilities: {
    bsonType: 'object',
    required: ['_id', 'name', 'latitude', 'longitude'],
    properties: { _id: str, name: str, latitude: num, longitude: num, phone: strN, verified: { bsonType: 'bool' } },
  },
  record_history: { bsonType: 'object', required: ['table', 'record_id', 'archived_at', 'record'] },
  consultation_messages: { bsonType: 'object', required: ['consultation_id', 'from', 'text', 'at'] },
  scheme_rules: { bsonType: 'object', required: ['_id', 'version'] },
};
