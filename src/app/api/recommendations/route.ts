import { NextResponse } from "next/server";

import { EventsApi } from "../../../api/events-api.js";
import { CompositeEventSource } from "../../../engine/composite-event-source.js";
import { MeteorShowerEventSource } from "../../../engine/meteor-shower-event-source.js";
import { OpenRouterAstronomyAdvisor } from "../../../llm/openrouter-astronomy-advisor.js";
import { LocalAstronomyEventSource } from "../../../providers/astronomy/localAstronomyEventSource.js";
import { OpenRouterClient } from "../../../providers/llm/openRouter.js";
import { GoogleMapsPlatformClient } from "../../../providers/maps/googleMaps.js";
import { OpenMeteoWeatherProvider } from "../../../providers/weather/openMeteo.js";
import type {
  PlaceCandidate,
  PlaceSearchProvider,
  PlaceSearchQuery,
  RouteEstimate,
  RouteQuery,
  RoutingProvider
} from "../../../providers/types.js";

export const runtime = "nodejs";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 14;
const DEFAULT_MAX_RESULTS = 6;
const DEFAULT_MAX_TRAVEL_MINUTES = 20;

interface RecommendationBody {
  latitude?: unknown;
  longitude?: unknown;
  elevationM?: unknown;
  locationLabel?: unknown;
  days?: unknown;
  maxResults?: unknown;
  maxTravelTimeMinutes?: unknown;
  timezoneOffsetMinutes?: unknown;
}

const toFiniteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : undefined;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const haversineMeters = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const radiusMeters = 6_371_000;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const offsetCoordinates = (
  latitude: number,
  longitude: number,
  northMeters: number,
  eastMeters: number
) => ({
  latitude: latitude + northMeters / 111_320,
  longitude:
    longitude +
    eastMeters / (111_320 * Math.cos((latitude * Math.PI) / 180))
});

class LocalPlaceSearchProvider implements PlaceSearchProvider {
  public readonly name = "local-fallback-places";

  public async searchNearby(query: PlaceSearchQuery): Promise<PlaceCandidate[]> {
    const templates = [
      {
        id: "ridge-lookout",
        name: "Nearby Ridge Lookout",
        northMeters: 2600,
        eastMeters: 1400,
        elevationMeters: 130,
        tags: { googlePrimaryType: "observation_deck" }
      },
      {
        id: "foreshore-park",
        name: "Open Foreshore Park",
        northMeters: -1800,
        eastMeters: 2200,
        elevationMeters: 18,
        tags: { googlePrimaryType: "park" }
      },
      {
        id: "western-green",
        name: "Western Green Reserve",
        northMeters: 900,
        eastMeters: -3100,
        elevationMeters: 62,
        tags: { googlePrimaryType: "park" }
      },
      {
        id: "coastal-headland",
        name: "Coastal Headland",
        northMeters: -3400,
        eastMeters: -1200,
        elevationMeters: 74,
        tags: { googlePrimaryType: "beach" }
      }
    ];

    return templates
      .map((template): PlaceCandidate => {
        const coordinates = offsetCoordinates(
          query.latitude,
          query.longitude,
          template.northMeters,
          template.eastMeters
        );

        return {
          id: template.id,
          name: template.name,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          elevationMeters: template.elevationMeters,
          source: "manual",
          tags: template.tags
        };
      })
      .filter(
        (place) =>
          haversineMeters(query, place) <= Math.max(query.radiusMeters, 5_000)
      )
      .slice(0, query.limit ?? templates.length);
  }
}

class LocalRoutingProvider implements RoutingProvider {
  public readonly name = "local-fallback-routing";

  public async estimateRoute(query: RouteQuery): Promise<RouteEstimate> {
    const distanceMeters = haversineMeters(query.origin, query.destination);
    const speedMetersPerMinute =
      query.mode === "walking" ? 80 : query.mode === "cycling" ? 250 : 620;

    return {
      distanceMeters: Math.round(distanceMeters),
      travelTimeMinutes: Math.max(3, Math.round(distanceMeters / speedMetersPerMinute)),
      summary: "local-estimate"
    };
  }
}

const buildMapsProvider = (): PlaceSearchProvider & RoutingProvider => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    const placeProvider = new LocalPlaceSearchProvider();
    const routingProvider = new LocalRoutingProvider();

    return {
      name: "local-fallback-map",
      searchNearby: (query) => placeProvider.searchNearby(query),
      estimateRoute: (query) => routingProvider.estimateRoute(query)
    };
  }

  return new GoogleMapsPlatformClient({
    apiKey,
    regionCode: "AU",
    languageCode: "en"
  });
};

const buildEventsApi = () => {
  const mapsProvider = buildMapsProvider();
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  return new EventsApi({
    eventSource: new CompositeEventSource([
      new LocalAstronomyEventSource(),
      new MeteorShowerEventSource()
    ]),
    weatherProvider: new OpenMeteoWeatherProvider({
      baseUrl: process.env.OPEN_METEO_BASE_URL
    }),
    placeSearchProvider: mapsProvider,
    routingProvider: mapsProvider,
    astronomyAdvisor: openRouterKey
      ? new OpenRouterAstronomyAdvisor(new OpenRouterClient())
      : undefined
  });
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationBody;
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (
      latitude === undefined ||
      longitude === undefined ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: "Enter a valid latitude and longitude." },
        { status: 400 }
      );
    }

    const days = clamp(
      Math.round(toFiniteNumber(body.days) ?? DEFAULT_DAYS),
      1,
      MAX_DAYS
    );
    const maxResults = clamp(
      Math.round(toFiniteNumber(body.maxResults) ?? DEFAULT_MAX_RESULTS),
      1,
      12
    );
    const maxTravelTimeMinutes = clamp(
      Math.round(
        toFiniteNumber(body.maxTravelTimeMinutes) ?? DEFAULT_MAX_TRAVEL_MINUTES
      ),
      5,
      90
    );
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const api = buildEventsApi();

    const events = await api.getRecommendations({
      observer: {
        latitude,
        longitude,
        elevationM: toFiniteNumber(body.elevationM),
        locationLabel: toOptionalString(body.locationLabel),
        timezoneOffsetMinutes: toFiniteNumber(body.timezoneOffsetMinutes)
      },
      timeRange: { start, end },
      maxResults,
      maxTravelTimeMinutes
    });

    return NextResponse.json({
      events,
      metadata: {
        generatedAt: new Date().toISOString(),
        start: start.toISOString(),
        end: end.toISOString(),
        locationLabel: toOptionalString(body.locationLabel),
        mapsProvider: process.env.GOOGLE_MAPS_API_KEY
          ? "google-maps-platform"
          : "local-fallback",
        advisorProvider: process.env.OPENROUTER_API_KEY
          ? process.env.OPENROUTER_MODEL ?? "openai/gpt-5.4-mini"
          : "off"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build recommendations.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
