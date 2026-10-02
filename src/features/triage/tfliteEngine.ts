import type { UrgencyEngine } from './classifier';

/** Web / fallback: TFLite isn't available, callers fall back to the JS engine. */
export async function createTfliteEngine(): Promise<UrgencyEngine> {
  throw new Error('TFLite engine is native-only');
}
