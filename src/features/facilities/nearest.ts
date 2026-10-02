import type { Facility } from '../../db/types';

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Physical facilities sorted by distance (helplines excluded); unknown location keeps seed order. */
export function sortByDistance(list: Facility[], here: { latitude: number; longitude: number } | null) {
  const physical = list.filter((f) => f.type !== 'ambulance');
  if (!here) return physical.map((f) => ({ ...f, distanceKm: null as number | null }));
  return physical
    .map((f) => ({ ...f, distanceKm: haversineKm(here, f) as number | null }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/** Number to call/SMS in an emergency: nearest verified facility phone, else 108. */
export function emergencyFacilityNumber(list: Facility[], here: { latitude: number; longitude: number } | null) {
  const near = sortByDistance(list, here).find((f) => f.verified && f.phone && f.services.includes('emergency'));
  return near?.phone ?? '108';
}
