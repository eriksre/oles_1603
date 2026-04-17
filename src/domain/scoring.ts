import { classifyAstronomicalVisibility } from "./visibility.js";

type FixtureEventType =
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

interface RawAstronomyEvent {
  id: string;
  eventType: FixtureEventType;
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
}

interface RawObserver {
  lat: number;
  lon: number;
  elevationM: number;
  timeIso: string;
}

interface RawWeather {
  cloudCoverPct: number;
  lowCloudCoverPct: number;
  visibilityKm: number;
  windSpeedKph: number;
}

interface RawPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM: number;
  distanceM: number;
  travelTimeMinutes: number;
  placeType: string;
  openHorizonScore: number;
  darkSkyScore: number;
}

interface RawSky {
  sunAltitudeDeg?: number;
  moonAltitudeDeg?: number;
  moonIllumination?: number;
}

export interface WrapperScoredEvent {
  id: string;
  coolScore: number;
  finalScore: number;
  visible: boolean;
  suppressed: boolean;
  horizonSensitive: boolean;
  suppressionReasons: string[];
}

const BASELINE_COOL: Record<FixtureEventType, number> = {
  full_moon: 40,
  supermoon: 60,
  lunar_eclipse: 95,
  solar_eclipse: 100,
  planet_conjunction: 72,
  planet_opposition: 76,
  planet_parade: 85,
  meteor_shower: 80,
  aurora: 90,
  iss_pass: 65
};

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

function inferSunAltitude(event: RawAstronomyEvent, sky?: RawSky): number {
  if (sky?.sunAltitudeDeg !== undefined) {
    return sky.sunAltitudeDeg;
  }

  if ((event.targetAltitudeDeg ?? 20) < 8) {
    return -3;
  }

  return -16;
}

function buildSuppressionReasons(
  event: RawAstronomyEvent,
  weather: RawWeather,
  sunAltitudeDeg: number
): string[] {
  const reasons: string[] = [];
  const visibility = classifyAstronomicalVisibility({
    event,
    observer: { lat: 0, lon: 0 }
  });

  reasons.push(...visibility.reasons);

  if (
    (event.targetAltitudeDeg ?? 20) < 6 &&
    sunAltitudeDeg > -6 &&
    event.eventType === "planet_conjunction"
  ) {
    reasons.push("sun altitude is too bright for a subtle low-altitude event");
  }

  if (
    (event.eventType === "meteor_shower" || event.eventType === "aurora") &&
    (weather.cloudCoverPct >= 80 || weather.lowCloudCoverPct >= 75)
  ) {
    reasons.push(
      `cloud cover is too high for a practical ${event.eventType === "meteor_shower" ? "meteor shower" : "aurora"} recommendation`
    );
  }

  return reasons;
}

export function scoreAstronomyEvent(input: {
  event: RawAstronomyEvent;
  observer: RawObserver;
  weather: RawWeather;
  place: RawPlace;
  sky?: RawSky;
}): WrapperScoredEvent {
  const visibility = classifyAstronomicalVisibility({
    event: input.event,
    observer: input.observer
  });
  const sunAltitudeDeg = inferSunAltitude(input.event, input.sky);
  const suppressionReasons = buildSuppressionReasons(
    input.event,
    input.weather,
    sunAltitudeDeg
  );

  let weatherPenalty =
    input.weather.cloudCoverPct * 0.45 +
    input.weather.lowCloudCoverPct * 0.2 +
    Math.max(0, 20 - input.weather.visibilityKm) * 1.5;

  if (input.event.eventType === "meteor_shower" || input.event.eventType === "aurora") {
    weatherPenalty *= 1.25;
  }

  const travelPenalty = Math.max(0, input.place.travelTimeMinutes - 10) * 1.5;
  const twilightPenalty =
    suppressionReasons.includes(
      "sun altitude is too bright for a subtle low-altitude event"
    )
      ? 28
      : 0;
  const horizonPenalty = visibility.horizonSensitive ? 12 : 0;
  const confidenceBonus = (input.event.confidence - 0.5) * 20;

  const coolScore = clampScore(
    BASELINE_COOL[input.event.eventType] + confidenceBonus - weatherPenalty * 0.15
  );
  const finalScore = clampScore(
    coolScore - weatherPenalty * 0.45 - travelPenalty - twilightPenalty - horizonPenalty
  );

  return {
    id: input.event.id,
    coolScore,
    finalScore,
    visible: visibility.visible && suppressionReasons.length === 0,
    suppressed: suppressionReasons.length > 0,
    horizonSensitive: visibility.horizonSensitive,
    suppressionReasons
  };
}
