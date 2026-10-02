/**
 * SQLCipher key management (only loaded when EXPO_PUBLIC_SQLCIPHER=1).
 * Requires `npx expo install expo-secure-store` when you turn encryption on.
 */
import * as Crypto from 'expo-crypto';

const KEY_NAME = 'nabha_db_key_v1';

export async function getDbKey(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as {
    getItemAsync(k: string): Promise<string | null>;
    setItemAsync(k: string, v: string): Promise<void>;
  };
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key) {
    const bytes = Crypto.getRandomBytes(32);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key);
  }
  return key;
}
