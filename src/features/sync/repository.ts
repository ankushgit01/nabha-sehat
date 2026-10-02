/**
 * The only way feature code writes syncable data. Every write lands in local
 * storage first and resolves from there — the UI never awaits the network (spec §7).
 */
import type { LocalStore } from '../../platform/storage/LocalStore';
import type { RecordByTable, SyncMeta, SyncTable } from '../../db/types';

export interface RepoDeps {
  store: LocalStore;
  newId: () => string;
  now?: () => Date;
  /** Current identity; anonymous users write `local_only` records. */
  identity: () => { userId: string; registered: boolean };
  /** Called after each local write so the sync layer can opportunistically run. */
  onLocalWrite?: () => void;
}

type Payload<T extends SyncTable> = Omit<RecordByTable[T], keyof SyncMeta>;

export function createRepository(deps: RepoDeps) {
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();

  return {
    /**
     * `hold: true` keeps the record out of sync (local_only) until its next update —
     * used by SOS so the event isn't pushed before its GPS fix has been filled in.
     */
    async create<T extends SyncTable>(
      table: T,
      data: Payload<T>,
      opts?: { id?: string; hold?: boolean },
    ): Promise<RecordByTable[T]> {
      const { userId, registered: reg } = deps.identity();
      const registered = reg && !opts?.hold;
      const ts = now();
      const rec = {
        ...data,
        id: opts?.id ?? deps.newId(),
        user_id: userId,
        created_at: ts,
        updated_at: ts,
        server_updated_at: null,
        sync_status: registered ? 'pending' : 'local_only',
        sync_error: null,
      } as RecordByTable[T];
      await deps.store.put(table, rec);
      deps.onLocalWrite?.();
      return rec;
    },

    async update<T extends SyncTable>(
      table: T,
      id: string,
      patch: Partial<Payload<T>>,
      opts?: { hold?: boolean },
    ): Promise<RecordByTable[T]> {
      if (table === 'sos_events') {
        // The event itself is immutable. Only the fields that complete it (location fix,
        // delivery status) may be filled in, and only before the server has acknowledged it.
        const allowed = new Set([
          'sms_status',
          'call_status',
          'contacted_numbers',
          'latitude',
          'longitude',
          'location_accuracy_m',
          'location_error',
        ]);
        if (Object.keys(patch).some((k) => !allowed.has(k))) throw new Error('sos_events are append-only');
      }
      const cur = await deps.store.get<RecordByTable[T]>(table, id);
      if (!cur) throw new Error(`${table}/${id} not found`);
      if (table === 'sos_events' && cur.server_updated_at != null) return cur; // already archived server-side
      const registered = deps.identity().registered && !opts?.hold;
      const next = {
        ...cur,
        ...patch,
        updated_at: now(),
        sync_status: registered ? 'pending' : 'local_only',
      } as RecordByTable[T];
      await deps.store.put(table, next);
      deps.onLocalWrite?.();
      return next;
    },

    get<T extends SyncTable>(table: T, id: string) {
      return deps.store.get<RecordByTable[T]>(table, id);
    },

    list<T extends SyncTable>(table: T, where?: Record<string, string | number | null>) {
      return deps.store.list<RecordByTable[T]>(table, { where, orderBy: '-created_at' });
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
