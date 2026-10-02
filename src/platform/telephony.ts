/**
 * Phone call + SMS hand-off to the device's own telephony (works with ZERO data;
 * needs only cellular signal). One interface; platform differences live here only.
 */
import { Linking, Platform } from 'react-native';
import * as SMS from 'expo-sms';

export async function placeCall(number: string): Promise<'dialled' | 'unavailable' | 'failed'> {
  const url = `tel:${number.replace(/[^\d+]/g, '')}`;
  try {
    // canOpenURL is unreliable for tel: on some Android 11+ devices without <queries>; just try.
    await Linking.openURL(url);
    return 'dialled';
  } catch {
    return Platform.OS === 'web' ? 'unavailable' : 'failed';
  }
}

export async function sendSms(numbers: string[], body: string): Promise<'sent' | 'cancelled' | 'unavailable' | 'failed'> {
  try {
    if (Platform.OS !== 'web' && (await SMS.isAvailableAsync())) {
      // Opens the native composer pre-filled; Android cannot send silently without
      // SEND_SMS + a custom native module, and Play policy restricts that permission.
      const { result } = await SMS.sendSMSAsync(numbers, body);
      return result === 'cancelled' ? 'cancelled' : 'sent'; // 'unknown' on Android = handed off
    }
    const sep = Platform.OS === 'ios' ? '&' : '?';
    await Linking.openURL(`sms:${numbers.join(',')}${sep}body=${encodeURIComponent(body)}`);
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

export function mapsLink(lat: number, lon: number) {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
}
