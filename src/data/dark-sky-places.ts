export interface DarkSkyPlace {
  id: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  sourceUrl?: string;
  notes?: string;
}

export interface DarkSkyPlaceLookup {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export const DARK_SKY_PLACES: readonly DarkSkyPlace[] = [];

export function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const radiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const aTerm = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(aTerm)));
}

export function findDarkSkyPlacesWithinRadius(query: DarkSkyPlaceLookup): Array<DarkSkyPlace & { distanceMeters: number }> {
  return DARK_SKY_PLACES.map((place) => ({
    ...place,
    distanceMeters: haversineDistanceMeters(
      { latitude: query.latitude, longitude: query.longitude },
      { latitude: place.latitude, longitude: place.longitude }
    )
  })).filter((place) => place.distanceMeters <= query.radiusMeters);
}
