/**
 * Best-effort GPS for SOS. Never throws, never blocks longer than `timeoutMs`.
 * GPS itself needs no internet; on a cold start without A-GPS data a fix can be
 * slow, so we return the last known position immediately if it's recent enough.
 */
import * as Location from 'expo-location';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type LocationResult = { fix: Fix; error: null } | { fix: null; error: string };

export async function getBestEffortLocation(timeoutMs = 8000): Promise<LocationResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { fix: null, error: 'permission_denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { fix: null, error: 'location_off' };

    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 500 });
    const current = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), last ? 3000 : timeoutMs));
    const pos = (await Promise.race([current, timeout])) ?? last;
    if (!pos) return { fix: null, error: 'timeout' };
    return {
      fix: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null },
      error: null,
    };
  } catch (e) {
    return { fix: null, error: e instanceof Error ? e.message : 'unknown' };
  }
}
