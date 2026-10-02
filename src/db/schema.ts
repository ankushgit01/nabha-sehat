/**
 * Single source of truth for local tables. The native SQLite store builds its DDL
 * from this; the web IndexedDB store creates one object store per table with the
 * same indexes. Bump SCHEMA_VERSION and append to MIGRATIONS for changes.
 */
export type ColType = 'TEXT' | 'INTEGER' | 'REAL' | 'JSON' | 'BOOL';

export interface TableDef {
  columns: Record<string, ColType>;
  indexes: string[];
}

const syncCols: Record<string, ColType> = {
  id: 'TEXT',
  user_id: 'TEXT',
  created_at: 'TEXT',
  updated_at: 'TEXT',
  server_updated_at: 'INTEGER',
  sync_status: 'TEXT',
  sync_error: 'TEXT',
};

export const TABLES = {
  users: {
    columns: {
      id: 'TEXT',
      phone: 'TEXT',
      name: 'TEXT',
      preferred_language: 'TEXT',
      registration_status: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
    indexes: [],
  },
  symptom_logs: {
    columns: {
      ...syncCols,
      input_text: 'TEXT',
      transcript: 'TEXT',
      input_language: 'TEXT',
      selected_symptoms: 'JSON',
      modifiers: 'JSON',
      urgency: 'TEXT',
      confidence: 'REAL',
      concern_areas: 'JSON',
      red_flags: 'JSON',
      model_version: 'TEXT',
      inference_ms: 'REAL',
      advice_topic: 'TEXT',
    },
    indexes: ['user_id', 'sync_status', 'created_at'],
  },
  consultations: {
    columns: {
      ...syncCols,
      symptom_log_id: 'TEXT',
      mode: 'TEXT',
      status: 'TEXT',
      patient_note: 'TEXT',
      doctor_id: 'TEXT',
      doctor_name: 'TEXT',
      notes: 'TEXT',
      prescription: 'TEXT',
      room_url: 'TEXT',
      started_at: 'TEXT',
      completed_at: 'TEXT',
    },
    indexes: ['user_id', 'sync_status', 'status'],
  },
  sos_events: {
    columns: {
      ...syncCols,
      latitude: 'REAL',
      longitude: 'REAL',
      location_accuracy_m: 'REAL',
      location_error: 'TEXT',
      reported_symptom: 'TEXT',
      contacted_numbers: 'JSON',
      sms_status: 'TEXT',
      call_status: 'TEXT',
    },
    indexes: ['user_id', 'sync_status', 'created_at'],
  },
  health_records: {
    columns: {
      ...syncCols,
      type: 'TEXT',
      reference_id: 'TEXT',
      title: 'TEXT',
      file_uri: 'TEXT',
      file_remote_url: 'TEXT',
      mime_type: 'TEXT',
      summary: 'TEXT',
    },
    indexes: ['user_id', 'sync_status', 'created_at', 'reference_id'],
  },
  facilities: {
    columns: {
      id: 'TEXT',
      name: 'TEXT',
      name_local: 'JSON',
      type: 'TEXT',
      latitude: 'REAL',
      longitude: 'REAL',
      services: 'JSON',
      phone: 'TEXT',
      address: 'TEXT',
      verified: 'BOOL',
      updated_at: 'TEXT',
    },
    indexes: [],
  },
  emergency_contacts: {
    columns: { id: 'TEXT', name: 'TEXT', phone: 'TEXT', relation: 'TEXT' },
    indexes: [],
  },
  /** Key/value for sync cursors etc. (AsyncStorage holds UI prefs; this holds data-layer state). */
  meta: {
    columns: { id: 'TEXT', value: 'TEXT' },
    indexes: [],
  },
} as const satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;
export const SCHEMA_VERSION = 1;

/** Append-only list; index i migrates from version i to i+1. */
export const MIGRATIONS: string[][] = [];

export function createTableSql(name: TableName): string[] {
  const def: TableDef = TABLES[name];
  const cols = Object.entries(def.columns)
    .map(([c, t]) => {
      const sqlType = t === 'JSON' ? 'TEXT' : t === 'BOOL' ? 'INTEGER' : t;
      return `"${c}" ${sqlType}${c === 'id' ? ' PRIMARY KEY NOT NULL' : ''}`;
    })
    .join(', ');
  return [
    `CREATE TABLE IF NOT EXISTS "${name}" (${cols});`,
    ...def.indexes.map((ix) => `CREATE INDEX IF NOT EXISTS "ix_${name}_${ix}" ON "${name}" ("${ix}");`),
  ];
}

export function encodeRow(name: TableName, rec: Record<string, unknown>): Record<string, unknown> {
  const def: TableDef = TABLES[name];
  const out: Record<string, unknown> = {};
  for (const [c, t] of Object.entries(def.columns)) {
    const v = rec[c];
    if (v === undefined || v === null) out[c] = null;
    else if (t === 'JSON') out[c] = JSON.stringify(v);
    else if (t === 'BOOL') out[c] = v ? 1 : 0;
    else out[c] = v;
  }
  return out;
}

export function decodeRow<T>(name: TableName, row: Record<string, unknown>): T {
  const def: TableDef = TABLES[name];
  const out: Record<string, unknown> = {};
  for (const [c, t] of Object.entries(def.columns)) {
    const v = row[c];
    if (v === undefined || v === null) out[c] = null;
    else if (t === 'JSON') out[c] = JSON.parse(String(v));
    else if (t === 'BOOL') out[c] = v === 1 || v === true;
    else out[c] = v;
  }
  return out as T;
}
