export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function floorDateToInterval(date: Date, intervalMs: number): Date {
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

export function ceilDateToInterval(date: Date, intervalMs: number): Date {
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}

export function roundCoordinate(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildCoordinateKey(
  latitude: number,
  longitude: number,
  decimals = 3
): string {
  return `${roundCoordinate(latitude, decimals).toFixed(decimals)},${roundCoordinate(
    longitude,
    decimals
  ).toFixed(decimals)}`;
}

export function startOfObserverLocalDay(
  date: Date,
  timezoneOffsetMinutes = 0
): Date {
  const localMs = date.getTime() + timezoneOffsetMinutes * MINUTE_MS;
  const localDate = new Date(localMs);
  const localMidnightUtcMs = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate()
  );

  return new Date(localMidnightUtcMs - timezoneOffsetMinutes * MINUTE_MS);
}

export function pruneExpiredEntries<T extends { expiresAt: number }>(
  cache: Map<string, T>,
  nowMs: number
): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= nowMs) {
      cache.delete(key);
    }
  }
}
