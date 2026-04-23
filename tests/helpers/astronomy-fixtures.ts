export type EventType =
  | "full_moon"
  | "supermoon"
  | "lunar_eclipse"
  | "solar_eclipse"
  | "planet_conjunction"
  | "planet_opposition"
  | "planet_parade"
  | "meteor_shower"
  | "aurora"
  | "iss_pass";

export type RawAstronomyEvent = {
  id: string;
  eventType: EventType;
  title: string;
  description: string;
  sourceType: "derived" | "curated" | "live";
  sourceName: string;
  startTime: string;
  peakTime: string;
  endTime: string;
  confidence: number;
  targetAzimuthDeg?: number;
  targetAltitudeDeg?: number;
  azimuthSpanStartDeg?: number;
  azimuthSpanEndDeg?: number;
};

export type ObserverContext = {
  lat: number;
  lon: number;
  elevationM: number;
  timeIso: string;
};

export type WeatherContext = {
  cloudCoverPct: number;
  lowCloudCoverPct: number;
  visibilityKm: number;
  windSpeedKph: number;
};

export function baseObserver(): ObserverContext {
  return {
    lat: -33.8688,
    lon: 151.2093,
    elevationM: 58,
    timeIso: "2026-03-27T07:00:00.000Z",
  };
}

export function baseWeather(overrides: Partial<WeatherContext> = {}): WeatherContext {
  return {
    cloudCoverPct: 12,
    lowCloudCoverPct: 8,
    visibilityKm: 20,
    windSpeedKph: 9,
    ...overrides,
  };
}

export function baseEvent(overrides: Partial<RawAstronomyEvent> = {}): RawAstronomyEvent {
  return {
    id: "event-1",
    eventType: "lunar_eclipse",
    title: "Total lunar eclipse",
    description: "The Moon passes through Earth's shadow.",
    sourceType: "derived",
    sourceName: "astronomy-engine",
    startTime: "2026-03-27T07:20:00.000Z",
    peakTime: "2026-03-27T07:58:00.000Z",
    endTime: "2026-03-27T08:36:00.000Z",
    confidence: 0.95,
    targetAzimuthDeg: 104,
    targetAltitudeDeg: 14,
    ...overrides,
  };
}
