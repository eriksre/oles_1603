export const EVENT_TYPES = [
  "full_moon",
  "supermoon",
  "lunar_eclipse",
  "solar_eclipse",
  "moon_planet_close_approach",
  "planet_conjunction",
  "planetary_conjunction",
  "planet_opposition",
  "mercury_best_visibility",
  "venus_best_visibility",
  "planet_parade",
  "meteor_shower",
  "aurora",
  "iss_pass"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const SOURCE_TYPES = ["derived", "curated", "live"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const SUPPRESSION_REASONS = [
  "below_horizon",
  "too_bright",
  "poor_weather",
  "low_confidence",
  "missing_geometry"
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export type VisibilityBucket =
  | "not_visible"
  | "horizon_sensitive"
  | "visible";

export type SkyDarkness =
  | "daylight"
  | "civil_or_nautical_twilight"
  | "astronomical_twilight"
  | "dark";

export interface EventScoreBreakdown {
  rarity: number;
  visualImpact: number;
  nakedEye: number;
  timing: number;
  weather: number;
  accessibility: number;
}

export interface AstronomyEventCore {
  id: string;
  eventType: EventType;
  title: string;
  description: string;
  startTime: Date;
  peakTime: Date;
  endTime: Date;
  sourceType: SourceType;
  sourceName: string;
  confidence: number;
}

export interface AstronomyGeometry {
  targetAzimuthDeg?: number;
  targetAltitudeDeg?: number;
  targetDirectionLabel?: string;
  azimuthSpanStartDeg?: number;
  azimuthSpanEndDeg?: number;
  sunAltitudeDeg?: number;
  moonAltitudeDeg?: number;
  moonIllumination?: number;
  localBestViewingTime?: Date;
  localBestViewingAzimuthDeg?: number;
  localBestViewingAltitudeDeg?: number;
  localBestViewingDirectionLabel?: string;
  localBestViewingSunAltitudeDeg?: number;
  localBestViewingMoonAltitudeDeg?: number;
  localBestViewingMoonIllumination?: number;
}

export interface PracticalConditions {
  cloudCoverPct?: number;
  lowCloudCoverPct?: number;
  cloudCoverMidPct?: number;
  cloudCoverHighPct?: number;
  visibilityKm?: number;
  windSpeedKph?: number;
  precipitationProbabilityPct?: number;
  temperatureC?: number;
  weatherForecastTimeUtc?: string;
  weatherForecastProvider?: string;
  weatherForecastDeltaMinutes?: number;
  seeingArcSeconds?: number;
  transparencyMagnitudePerAirmass?: number;
}

export interface RecommendationFields {
  instructionText?: string;
}

export interface AstronomyEventCandidate
  extends AstronomyEventCore,
    AstronomyGeometry,
    PracticalConditions,
    RecommendationFields {}

export interface VisibilityAssessment {
  isVisible: boolean;
  isSuppressed: boolean;
  visibilityBucket: VisibilityBucket;
  skyDarkness: SkyDarkness;
  horizonSensitive: boolean;
  suppressionReasons: SuppressionReason[];
  viewQualityScore: number;
}

export interface ScoredAstronomyEvent extends AstronomyEventCandidate {
  visibility: VisibilityAssessment;
  coolScore: number;
  finalScore: number;
  scoreBreakdown: EventScoreBreakdown;
}
