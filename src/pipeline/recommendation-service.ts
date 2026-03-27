import type { AstronomyEventSource } from "../engine/contracts.js";
import type { AstronomyEventCandidate, ScoredAstronomyEvent } from "../domain/events.js";
import type { PlaceCandidate, NearbyPlaceProvider, TravelTimeProvider } from "../domain/places.js";
import type { RecommendationRequest } from "../domain/observer.js";
import { scoreAstronomyEvent } from "../scoring/cool-score.js";
import { assessVisibility } from "../scoring/visibility.js";
import { normalizeEventCandidate } from "./normalize-event.js";
import type { WeatherForecastHour, WeatherProvider } from "../providers/types.js";

const sortByScore = (left: ScoredAstronomyEvent, right: ScoredAstronomyEvent): number =>
  right.finalScore - left.finalScore || right.coolScore - left.coolScore;

const findNearestForecast = (
  event: AstronomyEventCandidate,
  forecastPoints: WeatherForecastHour[]
): WeatherForecastHour | undefined => {
  const targetTime = event.peakTime.getTime();
  let best: WeatherForecastHour | undefined;
  let smallestDelta = Number.POSITIVE_INFINITY;

  for (const point of forecastPoints) {
    const delta = Math.abs(new Date(point.timeUtc).getTime() - targetTime);

    if (delta < smallestDelta) {
      smallestDelta = delta;
      best = point;
    }
  }

  return best;
};

const applyForecast = (
  event: AstronomyEventCandidate,
  forecast?: WeatherForecastHour
): AstronomyEventCandidate => {
  if (!forecast) {
    return event;
  }

  return {
    ...event,
    cloudCoverPct: event.cloudCoverPct ?? forecast.cloudCoverPct,
    lowCloudCoverPct: event.lowCloudCoverPct ?? forecast.cloudCoverLowPct,
    visibilityKm: event.visibilityKm ?? forecast.visibilityKm,
    windSpeedKph: event.windSpeedKph ?? forecast.windSpeedKph,
    precipitationProbabilityPct:
      event.precipitationProbabilityPct ?? forecast.precipitationProbabilityPct,
    seeingArcSeconds: event.seeingArcSeconds,
    transparencyMagnitudePerAirmass: event.transparencyMagnitudePerAirmass
  };
};

const applyPlaceRecommendation = (
  event: AstronomyEventCandidate,
  place?: PlaceCandidate,
  travelTimeMinutes?: number,
  distanceM?: number
): AstronomyEventCandidate => {
  if (!place) {
    return event;
  }

  return {
    ...event,
    recommendedPlaceName: place.name,
    recommendedPlaceLat: place.latitude,
    recommendedPlaceLon: place.longitude,
    travelTimeMinutes: event.travelTimeMinutes ?? travelTimeMinutes,
    distanceM: event.distanceM ?? distanceM,
    instructionText:
      event.instructionText ??
      (event.targetDirectionLabel
        ? `Head to ${place.name}. Face ${event.targetDirectionLabel} and look up.`
        : `Head to ${place.name} for a clearer view.`)
  };
};

const prefersDarkSky = (eventType: AstronomyEventCandidate["eventType"]): boolean =>
  eventType === "meteor_shower" || eventType === "aurora";

const prefersOpenHorizon = (event: AstronomyEventCandidate): boolean =>
  event.eventType === "lunar_eclipse" ||
  event.eventType === "solar_eclipse" ||
  event.eventType === "mercury_best_visibility" ||
  event.eventType === "venus_best_visibility" ||
  event.targetAltitudeDeg === undefined ||
  event.targetAltitudeDeg < 12;

const scorePlaceForEvent = (
  place: PlaceCandidate,
  event: AstronomyEventCandidate,
  travelTimeMinutes?: number
): number => {
  const openness = place.directionOpennessScore ?? 55;
  const elevation = Math.max(0, Math.min(100, (place.elevationM ?? 0) / 10));
  const darkness = 100 - (place.lightPollutionScore ?? 45);
  const travel = travelTimeMinutes === undefined ? 70 : Math.max(10, 100 - travelTimeMinutes * 1.5);

  let score = travel * 0.35 + elevation * 0.2 + openness * 0.25;

  if (prefersDarkSky(event.eventType)) {
    score += darkness * 0.3;
  } else {
    score += darkness * 0.1;
  }

  if (prefersOpenHorizon(event)) {
    score += openness * 0.25;
  }

  if (place.placeType === "viewpoint" || place.placeType === "observation_deck") {
    score += 8;
  }

  if (place.placeType === "national_park" && prefersDarkSky(event.eventType)) {
    score += 10;
  }

  return score;
};

export interface RecommendationServiceDependencies {
  eventSource: AstronomyEventSource;
  weatherProvider?: WeatherProvider;
  placeProvider?: NearbyPlaceProvider;
  travelTimeProvider?: TravelTimeProvider;
  candidatePlaceRadiusMeters?: number;
}

export class RecommendationService {
  private readonly candidatePlaceRadiusMeters: number;

  public constructor(private readonly deps: RecommendationServiceDependencies) {
    this.candidatePlaceRadiusMeters = deps.candidatePlaceRadiusMeters ?? 30_000;
  }

  public async getRecommendations(
    request: RecommendationRequest
  ): Promise<ScoredAstronomyEvent[]> {
    const rawEvents = await this.deps.eventSource.generateEvents(
      request.observer,
      request.timeRange
    );
    const forecast = this.deps.weatherProvider
      ? await this.deps.weatherProvider.getForecast({
          latitude: request.observer.latitude,
          longitude: request.observer.longitude,
          elevationMeters: request.observer.elevationM,
          startUtc: request.timeRange.start.toISOString(),
          endUtc: request.timeRange.end.toISOString()
        })
      : undefined;

    const enrichedWithWeather = rawEvents.map((event) =>
      normalizeEventCandidate(
        applyForecast(event, findNearestForecast(event, forecast?.hours ?? []))
      )
    );

    const maybePlaced = await this.attachPlaceRecommendations(
      enrichedWithWeather,
      request
    );

    const scored = maybePlaced
      .map((event) => {
        const visibility = assessVisibility(event);

        return scoreAstronomyEvent(event, visibility, request.observer);
      })
      .filter((event) => request.includeSuppressed || !event.visibility.isSuppressed)
      .sort(sortByScore);

    return request.maxResults ? scored.slice(0, request.maxResults) : scored;
  }

  private async attachPlaceRecommendations(
    events: AstronomyEventCandidate[],
    request: RecommendationRequest
  ): Promise<AstronomyEventCandidate[]> {
    if (!this.deps.placeProvider) {
      return events;
    }

    const places = await this.deps.placeProvider.searchNearby(
      request.observer,
      this.candidatePlaceRadiusMeters
    );

    if (places.length === 0) {
      return events;
    }

    const travelEstimates = this.deps.travelTimeProvider
      ? await this.deps.travelTimeProvider.estimateTravelTimes(
          request.observer,
          places,
          request.travelMode ?? "driving"
        )
      : [];

    const travelByPlaceId = new Map(
      travelEstimates.map((estimate) => [estimate.placeId, estimate] as const)
    );

    return events.map((event) => {
      const rankedPlaces = [...places].sort((left, right) => {
        const leftEstimate = travelByPlaceId.get(left.id);
        const rightEstimate = travelByPlaceId.get(right.id);

        return (
          scorePlaceForEvent(right, event, rightEstimate?.travelTimeMinutes) -
          scorePlaceForEvent(left, event, leftEstimate?.travelTimeMinutes)
        );
      });
      const bestPlace = rankedPlaces[0];
      const bestEstimate = travelByPlaceId.get(bestPlace.id);

      return applyPlaceRecommendation(
        event,
        bestPlace,
        bestEstimate?.travelTimeMinutes,
        bestEstimate?.distanceM
      );
    });
  }
}
