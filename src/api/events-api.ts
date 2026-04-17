import type { AstronomyEventSource } from "../engine/contracts.js";
import type {
  NearbyPlaceProvider,
  PlaceCandidate as DomainPlace,
  TravelTimeProvider
} from "../domain/places.js";
import type { RecommendationRequest } from "../domain/observer.js";
import { RecommendationService } from "../pipeline/recommendation-service.js";
import type { PlaceSearchProvider, RoutingProvider, WeatherProvider } from "../providers/types.js";
import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { AstronomyAdvisor, ReachablePlaceOption } from "../llm/astronomy-advisor.js";

const mapPlaceType = (tags?: Record<string, string>): DomainPlace["placeType"] => {
  const primaryType = tags?.googlePrimaryType ?? "";

  if (primaryType.includes("beach")) {
    return "beach";
  }

  if (primaryType.includes("campground")) {
    return "campground";
  }

  if (primaryType.includes("park")) {
    return "city_park";
  }

  if (primaryType.includes("observation")) {
    return "observation_deck";
  }

  return "viewpoint";
};

class PlaceSearchAdapter implements NearbyPlaceProvider {
  public constructor(private readonly placeSearchProvider: PlaceSearchProvider) {}

  public async searchNearby(
    observer: RecommendationRequest["observer"],
    radiusMeters: number
  ): Promise<DomainPlace[]> {
    const places = await this.placeSearchProvider.searchNearby({
      latitude: observer.latitude,
      longitude: observer.longitude,
      radiusMeters,
      limit: 12
    });

    return places.map((place) => ({
      id: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      elevationM: place.elevationMeters,
      placeType: mapPlaceType(place.tags),
      tags: place.tags
    }));
  }
}

class CachedPlaceSearchProvider implements PlaceSearchProvider {
  public readonly name: string;
  private readonly cache = new Map<string, ReturnType<PlaceSearchProvider["searchNearby"]>>();

  public constructor(private readonly provider: PlaceSearchProvider) {
    this.name = provider.name;
  }

  public searchNearby(query: Parameters<PlaceSearchProvider["searchNearby"]>[0]) {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const result = this.provider.searchNearby(query);
    this.cache.set(key, result);

    return result;
  }
}

class RoutingAdapter implements TravelTimeProvider {
  public constructor(private readonly routingProvider: RoutingProvider) {}

  public async estimateTravelTimes(
    observer: RecommendationRequest["observer"],
    places: DomainPlace[],
    mode: RecommendationRequest["travelMode"] = "driving"
  ) {
    return Promise.all(
      places.map(async (place) => {
        const route = await this.routingProvider.estimateRoute({
          origin: {
            latitude: observer.latitude,
            longitude: observer.longitude,
            elevationMeters: observer.elevationM
          },
          destination: {
            latitude: place.latitude,
            longitude: place.longitude,
            elevationMeters: place.elevationM
          },
          mode
        });

        return {
          placeId: place.id,
          distanceM: route.distanceMeters,
          travelTimeMinutes: route.travelTimeMinutes,
          mode
        };
      })
    );
  }
}

class CachedRoutingProvider implements RoutingProvider {
  public readonly name: string;
  private readonly cache = new Map<string, ReturnType<RoutingProvider["estimateRoute"]>>();

  public constructor(private readonly provider: RoutingProvider) {
    this.name = provider.name;
  }

  public estimateRoute(query: Parameters<RoutingProvider["estimateRoute"]>[0]) {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const result = this.provider.estimateRoute(query);
    this.cache.set(key, result);

    return result;
  }
}

export interface EventsApiDependencies {
  eventSource: AstronomyEventSource;
  weatherProvider: WeatherProvider;
  placeSearchProvider: PlaceSearchProvider;
  routingProvider: RoutingProvider;
  astronomyAdvisor?: AstronomyAdvisor;
}

export interface EventsApiRequest {
  observer: RecommendationRequest["observer"];
  timeRange: RecommendationRequest["timeRange"];
  maxResults?: number;
  maxTravelTimeMinutes?: number;
}

export interface PresentedAstronomyEvent extends ScoredAstronomyEvent {
  displayDescription?: string;
  locationSelectionReason?: string;
}

export class EventsApi {
  public constructor(private readonly deps: EventsApiDependencies) {}

  public async getRecommendations(request: EventsApiRequest) {
    const placeSearchProvider = new CachedPlaceSearchProvider(this.deps.placeSearchProvider);
    const routingProvider = new CachedRoutingProvider(this.deps.routingProvider);
    const service = new RecommendationService({
      eventSource: this.deps.eventSource,
      weatherProvider: this.deps.weatherProvider,
      placeProvider: new PlaceSearchAdapter(placeSearchProvider),
      travelTimeProvider: new RoutingAdapter(routingProvider),
      candidatePlaceRadiusMeters: 25_000
    });
    const recommendations = await service.getRecommendations({
      observer: request.observer,
      timeRange: request.timeRange,
      travelMode: "driving",
      maxTravelTimeMinutes: request.maxTravelTimeMinutes ?? 20,
      includeSuppressed: false,
      maxResults: request.maxResults
    });

    if (!this.deps.astronomyAdvisor || recommendations.length === 0) {
      return recommendations;
    }

    const candidatePlaces = await this.collectReachablePlaces(
      request,
      placeSearchProvider,
      routingProvider
    );

    return Promise.all(
      recommendations.map((event) =>
        this.applyAdvisor(event, request.observer, candidatePlaces)
      )
    );
  }

  private async collectReachablePlaces(
    request: EventsApiRequest,
    placeSearchProvider: PlaceSearchProvider,
    routingProvider: RoutingProvider
  ): Promise<ReachablePlaceOption[]> {
    const places = await placeSearchProvider.searchNearby({
      latitude: request.observer.latitude,
      longitude: request.observer.longitude,
      radiusMeters: 25_000,
      limit: 12
    });
    const maxTravelTimeMinutes = request.maxTravelTimeMinutes ?? 20;

    const routed = await Promise.all(
      places.map(async (place) => {
        const route = await routingProvider.estimateRoute({
          origin: {
            latitude: request.observer.latitude,
            longitude: request.observer.longitude,
            elevationMeters: request.observer.elevationM
          },
          destination: {
            latitude: place.latitude,
            longitude: place.longitude,
            elevationMeters: place.elevationMeters
          },
          mode: "driving"
        });

        return {
          id: place.id,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          placeType: mapPlaceType(place.tags),
          travelTimeMinutes: route.travelTimeMinutes,
          distanceMeters: route.distanceMeters,
          tags: place.tags
        } satisfies ReachablePlaceOption;
      })
    );

    return routed
      .filter((place) => place.travelTimeMinutes <= maxTravelTimeMinutes)
      .sort((left, right) => left.travelTimeMinutes - right.travelTimeMinutes);
  }

  private async applyAdvisor(
    event: ScoredAstronomyEvent,
    observer: RecommendationRequest["observer"],
    candidatePlaces: ReachablePlaceOption[]
  ): Promise<PresentedAstronomyEvent> {
    if (!this.deps.astronomyAdvisor) {
      return event;
    }

    let selectedPlace =
      candidatePlaces.find((place) => place.name === event.recommendedPlaceName) ??
      candidatePlaces[0];
    let locationSelectionReason: string | undefined;

    if (candidatePlaces.length > 1) {
      try {
        const decision = await this.deps.astronomyAdvisor.chooseLocation({
          observer,
          event,
          candidatePlaces
        });
        const advisorPlace = candidatePlaces.find(
          (place) => place.id === decision.selectedPlaceId
        );

        if (advisorPlace) {
          selectedPlace = advisorPlace;
          locationSelectionReason = decision.rationale;
        }
      } catch {
        // Deterministic ranking remains the fallback when the LLM call fails.
      }
    }

    let displayDescription: string | undefined;

    try {
      const narration = await this.deps.astronomyAdvisor.describeEvent({
        observer,
        event: selectedPlace
          ? {
              ...event,
              recommendedPlaceName: selectedPlace.name,
              recommendedPlaceLat: selectedPlace.latitude,
              recommendedPlaceLon: selectedPlace.longitude,
              travelTimeMinutes: selectedPlace.travelTimeMinutes,
              distanceM: selectedPlace.distanceMeters
            }
          : event,
        selectedPlace
      });

      displayDescription = narration.shortDescription;
    } catch {
      displayDescription = undefined;
    }

    if (!selectedPlace) {
      return {
        ...event,
        displayDescription,
        locationSelectionReason
      };
    }

    return {
      ...event,
      recommendedPlaceName: selectedPlace.name,
      recommendedPlaceLat: selectedPlace.latitude,
      recommendedPlaceLon: selectedPlace.longitude,
      travelTimeMinutes: selectedPlace.travelTimeMinutes,
      distanceM: selectedPlace.distanceMeters,
      displayDescription,
      locationSelectionReason
    };
  }
}
