import type {
  AstronomyEventCandidate,
  SkyDarkness,
  SuppressionReason,
  VisibilityAssessment,
  VisibilityBucket
} from "../domain/events.js";

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export const getSkyDarkness = (sunAltitudeDeg?: number): SkyDarkness => {
  if (sunAltitudeDeg === undefined) {
    return "astronomical_twilight";
  }

  if (sunAltitudeDeg > -6) {
    return "daylight";
  }

  if (sunAltitudeDeg > -12) {
    return "civil_or_nautical_twilight";
  }

  if (sunAltitudeDeg > -18) {
    return "astronomical_twilight";
  }

  return "dark";
};

const getVisibilityBucket = (targetAltitudeDeg?: number): VisibilityBucket => {
  if (targetAltitudeDeg === undefined) {
    return "visible";
  }

  if (targetAltitudeDeg <= 0) {
    return "not_visible";
  }

  if (targetAltitudeDeg < 10) {
    return "horizon_sensitive";
  }

  return "visible";
};

const needsDarkSky = (eventType: AstronomyEventCandidate["eventType"]): boolean =>
  eventType === "meteor_shower" || eventType === "aurora";

const isSubtleBrightSkyEvent = (event: AstronomyEventCandidate): boolean =>
  (event.eventType === "planetary_conjunction" ||
    event.eventType === "planet_conjunction" ||
    event.eventType === "mercury_best_visibility" ||
    event.eventType === "venus_best_visibility" ||
    event.eventType === "moon_planet_close_approach") &&
  (event.targetAltitudeDeg ?? 90) < 10;

const weatherPenalty = (event: AstronomyEventCandidate): number => {
  const totalCloud = event.cloudCoverPct ?? 35;
  const lowCloud = event.lowCloudCoverPct ?? totalCloud;
  const precipitation = event.precipitationProbabilityPct ?? 0;
  const wind = event.windSpeedKph ?? 12;

  return totalCloud * 0.45 + lowCloud * 0.2 + precipitation * 0.25 + Math.max(0, wind - 20) * 0.8;
};

export const assessVisibility = (event: AstronomyEventCandidate): VisibilityAssessment => {
  const suppressionReasons: SuppressionReason[] = [];
  const visibilityBucket = getVisibilityBucket(event.targetAltitudeDeg);
  const horizonSensitive = visibilityBucket === "horizon_sensitive";
  const skyDarkness = getSkyDarkness(event.sunAltitudeDeg);

  if (
    event.targetAltitudeDeg === undefined &&
    event.azimuthSpanStartDeg === undefined &&
    event.azimuthSpanEndDeg === undefined
  ) {
    suppressionReasons.push("missing_geometry");
  }

  if (visibilityBucket === "not_visible") {
    suppressionReasons.push("below_horizon");
  }

  if (
    needsDarkSky(event.eventType)
      ? skyDarkness === "daylight" || skyDarkness === "civil_or_nautical_twilight"
      : false
  ) {
    suppressionReasons.push("too_bright");
  }

  if (skyDarkness === "daylight" && isSubtleBrightSkyEvent(event)) {
    suppressionReasons.push("too_bright");
  }

  if ((event.cloudCoverPct ?? 0) >= 85 || (event.lowCloudCoverPct ?? 0) >= 90) {
    suppressionReasons.push("poor_weather");
  }

  if (event.confidence < 0.35) {
    suppressionReasons.push("low_confidence");
  }

  let baseScore = 100;

  if (visibilityBucket === "not_visible") {
    baseScore = 0;
  } else if (horizonSensitive) {
    baseScore -= 25;
  }

  if (skyDarkness === "daylight") {
    baseScore -= needsDarkSky(event.eventType) || isSubtleBrightSkyEvent(event) ? 50 : 15;
  } else if (skyDarkness === "civil_or_nautical_twilight") {
    baseScore -= needsDarkSky(event.eventType) || isSubtleBrightSkyEvent(event) ? 30 : 10;
  } else if (skyDarkness === "astronomical_twilight") {
    baseScore -= needsDarkSky(event.eventType) ? 8 : 0;
  }

  baseScore -= weatherPenalty(event);
  baseScore -= Math.max(0, (0.7 - event.confidence) * 35);

  return {
    isVisible: suppressionReasons.length === 0,
    isSuppressed: suppressionReasons.length > 0,
    visibilityBucket,
    skyDarkness,
    horizonSensitive,
    suppressionReasons,
    viewQualityScore: clampScore(baseScore)
  };
};
