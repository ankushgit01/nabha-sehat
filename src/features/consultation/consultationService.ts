/**
 * Consultation requests are ALWAYS written locally first (status 'queued').
 * Online: the sync worker pushes it within seconds and the server moves it to
 * 'waiting' → 'active' → 'completed'. Offline: it stays queued with a clear
 * "will send once you're back online" state — never dropped, never blocked.
 */
import type { Repository } from '../sync/repository';
import type { Consultation, ConsultationMode } from '../../db/types';

export async function requestConsultation(
  repo: Repository,
  p: { mode: ConsultationMode; symptomLogId: string | null; note: string | null },
): Promise<Consultation> {
  const c = await repo.create('consultations', {
    symptom_log_id: p.symptomLogId,
    mode: p.mode,
    status: 'queued',
    patient_note: p.note,
    doctor_id: null,
    doctor_name: null,
    notes: null,
    prescription: null,
    room_url: null,
    started_at: null,
    completed_at: null,
  });
  await repo.create('health_records', {
    type: 'consultation',
    reference_id: c.id,
    title: `consultation:${p.mode}`,
    file_uri: null,
    file_remote_url: null,
    mime_type: null,
    summary: p.note,
  });
  return c;
}

/** What the screen should show, derived purely from local state + connectivity. */
export function consultationView(c: Consultation, online: boolean) {
  if (c.status === 'completed') return 'completed' as const;
  if (c.status === 'cancelled') return 'cancelled' as const;
  if (c.status === 'active') return online ? ('active' as const) : ('active_offline' as const);
  if (c.sync_status !== 'synced') return 'queued_offline' as const; // not yet on server
  return 'waiting' as const;
}
