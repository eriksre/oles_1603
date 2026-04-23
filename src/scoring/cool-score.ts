import type {
  EventScoreBreakdown,
  EventType,
  ScoredAstronomyEvent
} from "../domain/events.js";
import type { AstronomyEventCandidate, VisibilityAssessment } from "../domain/events.js";
import type { ObserverContext } from "../domain/observer.js";

interface EventProfile {
  rarity: number;
  visualImpact: number;
  nakedEye: number;
  baselineCool: number;
}

const EVENT_PROFILES: Record<EventType, EventProfile> = {
  full_moon: { rarity: 35, visualImpact: 50, nakedEye: 100, baselineCool: 40 },
  supermoon: { rarity: 45, visualImpact: 65, nakedEye: 100, baselineCool: 60 },
  lunar_eclipse: { rarity: 95, visualImpact: 95, nakedEye: 100, baselineCool: 95 },
  solar_eclipse: { rarity: 100, visualImpact: 100, nakedEye: 70, baselineCool: 100 },
  moon_planet_close_approach: { rarity: 70, visualImpact: 70, nakedEye: 90, baselineCool: 70 },
  planet_conjunction: { rarity: 78, visualImpact: 75, nakedEye: 82, baselineCool: 74 },
  planetary_conjunction: { rarity: 78, visualImpact: 75, nakedEye: 82, baselineCool: 74 },
  planet_opposition: { rarity: 70, visualImpact: 78, nakedEye: 78, baselineCool: 76 },
  mercury_best_visibility: { rarity: 62, visualImpact: 48, nakedEye: 42, baselineCool: 38 },
  venus_best_visibility: { rarity: 64, visualImpact: 72, nakedEye: 92, baselineCool: 76 },
  planet_parade: { rarity: 88, visualImpact: 88, nakedEye: 85, baselineCool: 85 },
  meteor_shower: { rarity: 82, visualImpact: 82, nakedEye: 72, baselineCool: 80 },
  aurora: { rarity: 92, visualImpact: 96, nakedEye: 82, baselineCool: 90 },
  iss_pass: { rarity: 56, visualImpact: 66, nakedEye: 88, baselineCool: 65 }
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const getLocalHour = (date: Date, observer: ObserverContext): number | undefined => {
  if (observer.timezoneOffsetMinutes === undefined) {
    return undefined;
  }

  const localMs = date.getTime() + observer.timezoneOffsetMinutes * 60_000;

  return new Date(localMs).getUTCHours();
};

export const getTimingScore = (
  event: AstronomyEventCandidate,
  observer: ObserverContext
): number => {
  const localHour = getLocalHour(event.peakTime, observer);

  if (localHour === undefined) {
    return 65;
  }

  if (localHour >= 19 && localHour <= 22) {
    return 100;
  }

  if (localHour >= 17 && localHour < 19) {
    return 82;
  }

  if (localHour > 22 && localHour <= 0) {
    return 72;
  }

  if (localHour >= 1 && localHour <= 4) {
    return 48;
  }

  if (localHour >= 5 && localHour <= 6) {
    return 58;
  }

  return 35;
};

export const getWeatherScore = (
  event: AstronomyEventCandidate,
  visibility: VisibilityAssessment
): number => {
  if (visibility.isSuppressed && visibility.suppressionReasons.includes("poor_weather")) {
    return 10;
  }

  const totalCloud = event.cloudCoverPct ?? 35;
  const lowCloud = event.lowCloudCoverPct ?? totalCloud;
  const precipitation = event.precipitationProbabilityPct ?? 0;
  const visibilityKm = event.visibilityKm ?? 20;

  const cloudPenalty = totalCloud * 0.55 + lowCloud * 0.25;
  const precipitationPenalty = precipitation * 0.35;
  const visibilityPenalty = visibilityKm >= 20 ? 0 : (20 - visibilityKm) * 2;

  return clampScore(100 - cloudPenalty - precipitationPenalty - visibilityPenalty);
};

export const getAccessibilityScore = (): number => 70;

export const buildScoreBreakdown = (
  event: AstronomyEventCandidate,
  visibility: VisibilityAssessment,
  observer: ObserverContext
): EventScoreBreakdown => {
  const profile = EVENT_PROFILES[event.eventType];

  return {
    rarity: profile.rarity,
    visualImpact: profile.visualImpact,
    nakedEye: profile.nakedEye,
    timing: getTimingScore(event, observer),
    weather: getWeatherScore(event, visibility),
    accessibility: getAccessibilityScore()
  };
};

export const calculateCoolScore = (
  event: AstronomyEventCandidate,
  visibility: VisibilityAssessment,
  observer: ObserverContext
): { coolScore: number; breakdown: EventScoreBreakdown } => {
  const profile = EVENT_PROFILES[event.eventType];
  const breakdown = buildScoreBreakdown(event, visibility, observer);

  const weighted =
    breakdown.rarity * 0.3 +
    breakdown.visualImpact * 0.25 +
    breakdown.nakedEye * 0.2 +
    breakdown.timing * 0.1 +
    breakdown.weather * 0.1 +
    breakdown.accessibility * 0.05;

  const combined = weighted * 0.7 + profile.baselineCool * 0.3;

  return {
    coolScore: clampScore(combined),
    breakdown
  };
};

export const calculateFinalScore = (
  visibility: VisibilityAssessment,
  coolScore: number
): number => {
  const suppressedPenalty = visibility.isSuppressed ? 0.45 : 1;
  const horizonPenalty = visibility.horizonSensitive ? 0.88 : 1;
  const final = coolScore * (visibility.viewQualityScore / 100) * suppressedPenalty * horizonPenalty;

  return clampScore(final);
};

export const scoreAstronomyEvent = (
  event: AstronomyEventCandidate,
  visibility: VisibilityAssessment,
  observer: ObserverContext
): ScoredAstronomyEvent => {
  const { coolScore, breakdown } = calculateCoolScore(event, visibility, observer);

  return {
    ...event,
    visibility,
    coolScore,
    finalScore: calculateFinalScore(visibility, coolScore),
    scoreBreakdown: breakdown
  };
};
