/** Runs a triage and writes the encounter to the local health record (offline). */
import type { Repository } from '../sync/repository';
import type { Lang, SymptomLog, TriageModifiers } from '../../db/types';
import { classify, TriageResult } from './classifier';
import { SYMPTOM_BY_ID } from './vocab';

export async function runTriage(
  repo: Repository,
  input: { symptoms: string[]; modifiers: TriageModifiers; text: string | null; transcript: string | null; lang: Lang },
): Promise<{ log: SymptomLog; result: TriageResult }> {
  const result = await classify({ symptoms: input.symptoms, modifiers: input.modifiers });
  const log = await repo.create('symptom_logs', {
    input_text: input.text,
    transcript: input.transcript,
    input_language: input.lang,
    selected_symptoms: input.symptoms,
    modifiers: input.modifiers,
    urgency: result.urgency,
    confidence: result.confidence,
    concern_areas: result.concernAreas,
    red_flags: result.redFlags,
    model_version: result.modelVersion,
    inference_ms: Math.round(result.inferenceMs * 100) / 100,
    advice_topic: result.adviceTopic,
  });
  await repo.create('health_records', {
    type: 'symptom_log',
    reference_id: log.id,
    title: input.symptoms.map((s) => SYMPTOM_BY_ID.get(s)?.label[input.lang] ?? s).join(', '),
    file_uri: null,
    file_remote_url: null,
    mime_type: null,
    summary: result.urgency,
  });
  return { log, result };
}
