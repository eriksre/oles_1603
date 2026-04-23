import type { AstronomyEventSource } from "../engine/contracts.js";
import type { RecommendationRequest } from "../domain/observer.js";
import { RecommendationService } from "../pipeline/recommendation-service.js";
import type { WeatherForecast, WeatherProvider } from "../providers/types.js";
import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { AstronomyAdvisor } from "../llm/astronomy-advisor.js";
import { buildCoordinateKey, pruneExpiredEntries } from "../utils/stability.js";

export interface EventsApiDependencies {
  eventSource: AstronomyEventSource;
  weatherProvider?: WeatherProvider;
  astronomyAdvisor?: AstronomyAdvisor;
}

export interface EventsApiRequest {
  observer: RecommendationRequest["observer"];
  timeRange: RecommendationRequest["timeRange"];
  maxResults?: number;
}

export interface PresentedAstronomyEvent extends ScoredAstronomyEvent {
  displayDescription?: string;
}

export interface PresentedRecommendationsBundle {
  events: PresentedAstronomyEvent[];
  forecast?: WeatherForecast;
}

const narrationCache = new Map<
  string,
  { expiresAt: number; value: Promise<string> }
>();
const NARRATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export class EventsApi {
  public constructor(private readonly deps: EventsApiDependencies) {}

  public async getRecommendations(request: EventsApiRequest) {
    const bundle = await this.getRecommendationsBundle(request);

    return bundle.events;
  }

  public async getRecommendationsBundle(
    request: EventsApiRequest
  ): Promise<PresentedRecommendationsBundle> {
    const service = new RecommendationService({
      eventSource: this.deps.eventSource,
      weatherProvider: this.deps.weatherProvider
    });
    const recommendationBundle = await service.getRecommendationBundle({
      observer: request.observer,
      timeRange: request.timeRange,
      includeSuppressed: false,
      maxResults: request.maxResults
    });

    if (
      !this.deps.astronomyAdvisor ||
      recommendationBundle.events.length === 0
    ) {
      return {
        events: recommendationBundle.events,
        forecast: recommendationBundle.forecast
      };
    }

    const recommendations = await Promise.all(
      recommendationBundle.events.map((event) =>
        this.applyAdvisor(event, request.observer)
      )
    );

    return {
      events: recommendations,
      forecast: recommendationBundle.forecast
    };
  }

  private async applyAdvisor(
    event: ScoredAstronomyEvent,
    observer: RecommendationRequest["observer"]
  ): Promise<PresentedAstronomyEvent> {
    if (event.eventType === "iss_pass") {
      return {
        ...event,
        displayDescription: event.description
      };
    }

    if (!this.deps.astronomyAdvisor) {
      return event;
    }

    try {
      const cacheKey = `${buildCoordinateKey(
        observer.latitude,
        observer.longitude,
        3
      )}:${event.id}`;
      const nowMs = Date.now();
      pruneExpiredEntries(narrationCache, nowMs);
      const cached = narrationCache.get(cacheKey);
      const descriptionPromise =
        cached?.value ??
        this.deps.astronomyAdvisor
          .describeEvent({
            observer,
            event
          })
          .then((narration) => narration.shortDescription)
          .catch((error) => {
            narrationCache.delete(cacheKey);
            throw error;
          });

      if (!cached) {
        narrationCache.set(cacheKey, {
          expiresAt: nowMs + NARRATION_CACHE_TTL_MS,
          value: descriptionPromise
        });
      }

      const shortDescription = await descriptionPromise;

      return {
        ...event,
        displayDescription: shortDescription
      };
    } catch {
      return {
        ...event
      };
    }
  }
}
