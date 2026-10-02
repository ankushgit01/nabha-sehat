/**
 * Native storage: expo-sqlite.
 *
 * Encryption at rest (spec §8): expo-sqlite supports SQLCipher via its config plugin
 * (`["expo-sqlite", { "useSQLCipher": true }]`) followed by `PRAGMA key`. It is gated
 * behind EXPO_PUBLIC_SQLCIPHER=1 because it adds ~3–4 MB to the APK and must be
 * verified on the reference device. The key is generated once and kept in the OS
 * keystore via expo-secure-store (add the dependency when enabling).
 * Until enabled, `encrypted` is false and Settings says so.
 */
import * as SQLite from 'expo-sqlite';
import { createTableSql, decodeRow, encodeRow, TABLES, TableName, SCHEMA_VERSION, MIGRATIONS } from '../../db/schema';
import { assertDeletable, LocalStore, Query } from './LocalStore';

const ENCRYPT = process.env.EXPO_PUBLIC_SQLCIPHER === '1';

export function createStore(): LocalStore {
  let db: SQLite.SQLiteDatabase | null = null;
  const conn = () => {
    if (!db) throw new Error('LocalStore not initialised');
    return db;
  };

  return {
    encrypted: ENCRYPT,
    async init() {
      db = await SQLite.openDatabaseAsync('nabha.db');
      if (ENCRYPT) {
        const { getDbKey } = await import('./dbKey');
        await db.execAsync(`PRAGMA key = '${await getDbKey()}';`);
      }
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      let version = row?.user_version ?? 0;
      if (version === 0) {
        for (const name of Object.keys(TABLES) as TableName[]) {
          for (const sql of createTableSql(name)) await db.execAsync(sql);
        }
        version = SCHEMA_VERSION;
      }
      while (version < SCHEMA_VERSION) {
        for (const sql of MIGRATIONS[version - 1] ?? []) await db.execAsync(sql);
        version++;
      }
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    },

    async get<T>(table: TableName, id: string) {
      const row = await conn().getFirstAsync<Record<string, unknown>>(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
      return row ? decodeRow<T>(table, row) : undefined;
    },

    async list<T>(table: TableName, q?: Query) {
      const params: SQLite.SQLiteBindValue[] = [];
      const where = Object.entries(q?.where ?? {}).map(([k, v]) => {
        assertColumn(table, k);
        if (v === null) return `"${k}" IS NULL`;
        params.push(v);
        return `"${k}" = ?`;
      });
      let sql = `SELECT * FROM "${table}"`;
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      if (q?.orderBy) {
        const desc = q.orderBy.startsWith('-');
        const key = desc ? q.orderBy.slice(1) : q.orderBy;
        assertColumn(table, key);
        sql += ` ORDER BY "${key}" ${desc ? 'DESC' : 'ASC'}`;
      }
      if (q?.limit) sql += ` LIMIT ${Math.floor(q.limit)}`;
      const rows = await conn().getAllAsync<Record<string, unknown>>(sql, params);
      return rows.map((r) => decodeRow<T>(table, r));
    },

    async put(table, rec) {
      await upsert(conn(), table, rec);
    },

    async putMany(table, recs) {
      const d = conn();
      await d.withTransactionAsync(async () => {
        for (const r of recs) await upsert(d, table, r);
      });
    },

    async remove(table, id) {
      assertDeletable(table);
      await conn().runAsync(`DELETE FROM "${table}" WHERE id = ?`, [id]);
    },
  };
}

function assertColumn(table: TableName, col: string) {
  if (!(col in TABLES[table].columns)) throw new Error(`Unknown column ${table}.${col}`);
}

async function upsert(db: SQLite.SQLiteDatabase, table: TableName, rec: { id: string }) {
  const row = encodeRow(table, rec as unknown as Record<string, unknown>);
  const cols = Object.keys(row);
  const sql = `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols
    .map(() => '?')
    .join(',')})`;
  await db.runAsync(sql, Object.values(row) as SQLite.SQLiteBindValue[]);
}
