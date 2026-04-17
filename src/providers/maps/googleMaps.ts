import type {
  PlaceCandidate,
  PlaceSearchProvider,
  PlaceSearchQuery,
  RouteEstimate,
  RouteQuery,
  RoutingProvider
} from "../types.js";

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<FetchLikeResponse>;

export interface GoogleMapsClientOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  placesBaseUrl?: string;
  routesBaseUrl?: string;
  languageCode?: string;
  regionCode?: string;
  searchTerms?: string[];
}

export interface GoogleMapsPlaceSearchResult {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
}

export interface GoogleMapsSearchTextResponse {
  places?: GoogleMapsPlaceSearchResult[];
}

export interface GoogleMapsRouteResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
}

const DEFAULT_PLACES_BASE_URL = "https://places.googleapis.com/v1/places:searchText";
const DEFAULT_ROUTES_BASE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const DEFAULT_SEARCH_TERMS = [
  "viewpoint",
  "lookout",
  "observation deck",
  "park",
  "beach"
];

const parseDurationMinutes = (duration?: string): number => {
  if (!duration) {
    return 0;
  }

  const seconds = Number.parseFloat(duration.replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds / 60 : 0;
};

const dedupePlaces = (places: PlaceCandidate[]): PlaceCandidate[] => {
  const byId = new Map<string, PlaceCandidate>();

  for (const place of places) {
    byId.set(place.id, place);
  }

  return [...byId.values()];
};

export class GoogleMapsPlatformClient
  implements PlaceSearchProvider, RoutingProvider
{
  public readonly name = "google-maps-platform";

  private readonly fetchImpl: FetchLike;
  private readonly placesBaseUrl: string;
  private readonly routesBaseUrl: string;
  private readonly languageCode?: string;
  private readonly regionCode?: string;
  private readonly searchTerms: string[];

  public constructor(private readonly options: GoogleMapsClientOptions) {
    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
    this.placesBaseUrl = options.placesBaseUrl ?? DEFAULT_PLACES_BASE_URL;
    this.routesBaseUrl = options.routesBaseUrl ?? DEFAULT_ROUTES_BASE_URL;
    this.languageCode = options.languageCode;
    this.regionCode = options.regionCode;
    this.searchTerms = options.searchTerms ?? DEFAULT_SEARCH_TERMS;
  }

  public async searchNearby(query: PlaceSearchQuery): Promise<PlaceCandidate[]> {
    const results = await Promise.all(
      this.searchTerms.map(async (searchTerm) => {
        const response = await this.fetchImpl(this.placesBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.options.apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.location,places.primaryType,places.types"
          },
          body: JSON.stringify({
            textQuery: searchTerm,
            maxResultCount: query.limit ?? 8,
            languageCode: this.languageCode,
            regionCode: this.regionCode,
            locationBias: {
              circle: {
                center: {
                  latitude: query.latitude,
                  longitude: query.longitude
                },
                radius: query.radiusMeters
              }
            }
          })
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Google Places search failed with ${response.status} ${response.statusText}: ${body}`
          );
        }

        const payload = (await response.json()) as GoogleMapsSearchTextResponse;

        return (payload.places ?? [])
          .filter(
            (place) =>
              place.id &&
              place.displayName?.text &&
              place.location?.latitude !== undefined &&
              place.location?.longitude !== undefined
          )
          .map(
            (place): PlaceCandidate => ({
              id: place.id as string,
              name: place.displayName?.text as string,
              latitude: place.location?.latitude as number,
              longitude: place.location?.longitude as number,
              source: "google",
              tags: {
                googlePrimaryType: place.primaryType ?? "",
                googleTypes: (place.types ?? []).join(",")
              }
            })
          );
      })
    );

    return dedupePlaces(results.flat());
  }

  public async estimateRoute(query: RouteQuery): Promise<RouteEstimate> {
    const response = await this.fetchImpl(this.routesBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.options.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: query.origin.latitude,
              longitude: query.origin.longitude
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: query.destination.latitude,
              longitude: query.destination.longitude
            }
          }
        },
        travelMode: query.mode.toUpperCase()
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Google Routes request failed with ${response.status} ${response.statusText}: ${body}`
      );
    }

    const payload = (await response.json()) as GoogleMapsRouteResponse;
    const route = payload.routes?.[0];

    if (!route) {
      throw new Error("Google Routes returned no route.");
    }

    return {
      distanceMeters: route.distanceMeters ?? 0,
      travelTimeMinutes: parseDurationMinutes(route.duration),
      summary: "google-routes"
    };
  }

  public async findReachablePlacesWithinDriveTime(input: {
    origin: { latitude: number; longitude: number; elevationMeters?: number };
    radiusMeters: number;
    maxDriveMinutes: number;
    limit?: number;
  }): Promise<Array<PlaceCandidate & { route: RouteEstimate }>> {
    const places = await this.searchNearby({
      latitude: input.origin.latitude,
      longitude: input.origin.longitude,
      radiusMeters: input.radiusMeters,
      limit: input.limit
    });

    const routed = await Promise.all(
      places.map(async (place) => ({
        place,
        route: await this.estimateRoute({
          origin: input.origin,
          destination: place,
          mode: "driving"
        })
      }))
    );

    return routed
      .filter(({ route }) => route.travelTimeMinutes <= input.maxDriveMinutes)
      .sort((left, right) => left.route.travelTimeMinutes - right.route.travelTimeMinutes)
      .map(({ place, route }) => ({
        ...place,
        route
      }));
  }
}
