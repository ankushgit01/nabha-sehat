/**
 * AI photo / symptom check: the patient sends a photo (cut, burn, rash, bite...) and/or a
 * short description ("headache since morning"); Claude returns simple first-aid guidance.
 *
 * - The Anthropic API key lives only on the server (ANTHROPIC_API_KEY). Never in the app.
 * - Login required + per-user rate limit, so the key can't be abused from outside.
 * - Photos are NOT stored and the body is never logged (health data).
 * - This is guidance, not a diagnosis: the prompt forces an urgency level and
 *   "go to a doctor if..." list, and anything serious is told to call 108 / go to hospital.
 */
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const MODEL = 'claude-opus-5-5';

const Request = z
  .object({
    image: z
      .object({
        data: z.string().min(100).max(8_000_000), // base64, ~6 MB decoded
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      })
      .optional(),
    text: z.string().max(1000).optional(),
    lang: z.enum(['en', 'hi', 'pa']).default('en'),
    ageGroup: z.enum(['child', 'adult', 'elderly']).optional(),
    pregnant: z.boolean().optional(),
  })
  .refine((r) => r.image || r.text?.trim(), { message: 'send a photo or a description' });

export const Advice = z.object({
  /** emergency = call 108 / go to hospital now. */
  urgency: z.enum(['emergency', 'see_doctor_today', 'see_doctor_soon', 'home_care']),
  /** True when the photo is not a health problem, too blurry, or there is not enough to go on. */
  unclear: z.boolean(),
  /** Short name of the likely problem, e.g. "Small cut on finger". */
  title: z.string(),
  /** 1-2 plain sentences on what the photo/description shows. */
  what_we_see: z.string(),
  /** Numbered first-aid / home-care steps, simplest first. */
  steps: z.array(z.string()),
  /** Things NOT to do. */
  avoid: z.array(z.string()),
  /** Warning signs that mean see a doctor or go to hospital. */
  go_to_doctor_if: z.array(z.string()),
});
export type Advice = z.infer<typeof Advice>;

const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)', pa: 'Punjabi (Gurmukhi script)' } as const;

const SYSTEM = `You are the first-aid helper inside "Nabha Sehat", a rural telemedicine app used in Punjab, India, often by people with little formal education and far from a hospital.

The user sends a photo of a health problem (cut, wound, burn, rash, bite, swelling, eye redness, etc.) and/or describes symptoms (headache, fever, stomach ache, ...). Give safe, practical first-aid and home-care guidance.

Rules:
- You are not a doctor and this is not a diagnosis. Say what it LOOKS like ("looks like a small cut"), never claim certainty.
- Safety first. Choose urgency honestly:
  * emergency: heavy bleeding that won't stop, deep or gaping wounds, burns larger than the palm or on face/hands/genitals, snake or dog bite, signs of serious infection spreading (red streaks, fever with a wound), chest pain, trouble breathing, sudden worst-ever headache, headache with stiff neck/confusion/weakness/vision loss, fainting, seizures, poisoning, anything in a baby under 3 months, heavy bleeding or severe pain in pregnancy. Tell them to call 108 (ambulance) or go to the nearest hospital NOW, and give only the steps to do while getting help.
  * see_doctor_today / see_doctor_soon: needs a doctor but not an ambulance.
  * home_care: minor problems that can be handled at home.
- Use only simple things found in a village home or chemist: clean water, soap, clean cloth, bandage, ice/cold water, ORS, paracetamol. Do not name prescription medicines or antibiotics. If you mention paracetamol, say to follow the dose on the packet and to ask a doctor or chemist first for children, pregnant women, and people with liver problems.
- Correct harmful home remedies when relevant (e.g. no toothpaste, ghee, or ice directly on burns; no tight tourniquet; do not suck snake bites).
- If the photo is not of a health problem, is too blurry/dark, or there is not enough information, set unclear=true, urgency=see_doctor_soon, and use the steps to explain how to take a better photo or what to describe. Do not guess.
- Keep every item short: one simple sentence, no medical jargon. 3-7 steps, 2-5 "avoid", 3-6 "go to doctor if".
- Write every text field in the language requested by the user. Keep "108" as digits.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: config.anthropicKey, timeout: 80_000, maxRetries: 1 }));

export const ai = Router();
ai.use(express.json({ limit: '9mb' }));

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20, // per user per hour
  keyGenerator: (req) => req.user!.id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too many checks, try again later', code: 'rate_limited' },
});

ai.post('/check', requireAuth, limiter, async (req, res) => {
  if (!config.anthropicKey) return res.status(503).json({ error: 'AI check is not set up on the server', code: 'not_configured' });
  const parsed = Request.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid request', code: 'invalid' });
  const r = parsed.data;

  const about: string[] = [`Reply in ${LANG_NAME[r.lang]}.`];
  if (r.ageGroup) about.push(`Patient: ${r.ageGroup}${r.pregnant ? ', pregnant' : ''}.`);
  about.push(r.text?.trim() ? `What the patient says: """${r.text.trim()}"""` : 'The patient sent only a photo.');

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (r.image) content.push({ type: 'image', source: { type: 'base64', media_type: r.image.mediaType, data: r.image.data } });
  content.push({ type: 'text', text: about.join('\n') });

  try {
    const msg = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Advice) },
    });
    if (msg.stop_reason === 'refusal' || !msg.parsed_output) {
      return res.status(422).json({ error: 'could not check this, please talk to a doctor', code: 'no_answer' });
    }
    res.json({ advice: msg.parsed_output });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'busy, try again in a minute', code: 'busy' });
    if (err instanceof Anthropic.BadRequestError) {
      console.error('ai check rejected:', err.message);
      return res.status(400).json({ error: 'photo could not be read, try another photo', code: 'bad_image' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`ai check failed: ${err.status} ${err.message}`);
      return res.status(502).json({ error: 'AI service unavailable, try again', code: 'upstream' });
    }
    throw err;
  }
});
