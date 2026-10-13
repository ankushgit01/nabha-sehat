import type { UrgencyEngine } from './classifier';

/**
 * Expo Go build: no TFLite native module is available, so this always throws and the
 * app keeps the bundled pure-TypeScript engine (same model, same results).
 * For a custom dev client with react-native-fast-tflite, replace this file with
 * ./optional/tfliteEngine.native.ts.example (see README §5).
 */
export async function createTfliteEngine(): Promise<UrgencyEngine> {
  throw new Error('TFLite engine not included in the Expo Go build');
}
