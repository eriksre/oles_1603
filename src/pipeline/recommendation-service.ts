import type { AstronomyEventSource } from "../engine/contracts.js";
import type { AstronomyEventCandidate, ScoredAstronomyEvent } from "../domain/events.js";
import type { RecommendationRequest } from "../domain/observer.js";
import { scoreAstronomyEvent } from "../scoring/cool-score.js";
import { assessVisibility } from "../scoring/visibility.js";
import { normalizeEventCandidate } from "./normalize-event.js";
import type { WeatherForecast, WeatherForecastHour, WeatherProvider } from "../providers/types.js";

const sortByScore = (left: ScoredAstronomyEvent, right: ScoredAstronomyEvent): number =>
  right.finalScore - left.finalScore ||
  right.coolScore - left.coolScore ||
  left.peakTime.getTime() - right.peakTime.getTime() ||
  left.startTime.getTime() - right.startTime.getTime() ||
  left.id.localeCompare(right.id);

interface ForecastMatch {
  point: WeatherForecastHour;
  deltaMinutes: number;
}

const findNearestForecast = (
  event: AstronomyEventCandidate,
  forecastPoints: WeatherForecastHour[]
): ForecastMatch | undefined => {
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

  if (!best) {
    return undefined;
  }

  return {
    point: best,
    deltaMinutes: Math.round(smallestDelta / 60_000)
  };
};

const applyForecast = (
  event: AstronomyEventCandidate,
  providerName?: string,
  forecastMatch?: ForecastMatch
): AstronomyEventCandidate => {
  if (!forecastMatch) {
    return event;
  }

  const { point: forecast, deltaMinutes } = forecastMatch;

  return {
    ...event,
    cloudCoverPct: event.cloudCoverPct ?? forecast.cloudCoverPct,
    lowCloudCoverPct: event.lowCloudCoverPct ?? forecast.cloudCoverLowPct,
    cloudCoverMidPct: event.cloudCoverMidPct ?? forecast.cloudCoverMidPct,
    cloudCoverHighPct: event.cloudCoverHighPct ?? forecast.cloudCoverHighPct,
    visibilityKm: event.visibilityKm ?? forecast.visibilityKm,
    windSpeedKph: event.windSpeedKph ?? forecast.windSpeedKph,
    temperatureC: event.temperatureC ?? forecast.temperatureC,
    precipitationProbabilityPct:
      event.precipitationProbabilityPct ?? forecast.precipitationProbabilityPct,
    weatherForecastTimeUtc: forecast.timeUtc,
    weatherForecastProvider: providerName,
    weatherForecastDeltaMinutes: deltaMinutes,
    seeingArcSeconds: event.seeingArcSeconds,
    transparencyMagnitudePerAirmass: event.transparencyMagnitudePerAirmass
  };
};

export interface RecommendationServiceDependencies {
  eventSource: AstronomyEventSource;
  weatherProvider?: WeatherProvider;
}

export interface RecommendationBundle {
  events: ScoredAstronomyEvent[];
  forecast?: WeatherForecast;
}

const resolveLiveAnchor = (request: RecommendationRequest): Date =>
  request.observer.liveAnchorTime ??
  request.observer.snapshotTime ??
  request.timeRange.start;

export class RecommendationService {
  public constructor(private readonly deps: RecommendationServiceDependencies) {}

  public async getRecommendations(
    request: RecommendationRequest
  ): Promise<ScoredAstronomyEvent[]> {
    const bundle = await this.getRecommendationBundle(request);

    return bundle.events;
  }

  public async getRecommendationBundle(
    request: RecommendationRequest
  ): Promise<RecommendationBundle> {
    const liveAnchor = resolveLiveAnchor(request);
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
        applyForecast(
          event,
          forecast?.provider,
          findNearestForecast(event, forecast?.hours ?? [])
        )
      )
    );

    const scored = enrichedWithWeather
      .map((event) => {
        const visibility = assessVisibility(event);

        return scoreAstronomyEvent(event, visibility, request.observer);
      })
      .filter((event) => event.endTime.getTime() >= liveAnchor.getTime())
      .filter((event) => request.includeSuppressed || !event.visibility.isSuppressed)
      .sort(sortByScore);

    return {
      events: request.maxResults ? scored.slice(0, request.maxResults) : scored,
      forecast
    };
  }
}
