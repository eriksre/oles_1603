export interface Coordinates {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface TimeRange {
  startUtc: string;
  endUtc: string;
  timezone?: string;
}

export interface WeatherForecastQuery extends Coordinates {
  startUtc: string;
  endUtc: string;
  timezone?: string;
}

export interface WeatherForecastHour {
  timeUtc: string;
  cloudCoverPct?: number;
  cloudCoverLowPct?: number;
  cloudCoverMidPct?: number;
  cloudCoverHighPct?: number;
  visibilityKm?: number;
  precipitationProbabilityPct?: number;
  windSpeedKph?: number;
  temperatureC?: number;
}

export interface WeatherForecast {
  provider: string;
  latitude: number;
  longitude: number;
  timezone: string;
  hours: WeatherForecastHour[];
  raw?: unknown;
}

export interface WeatherProvider {
  readonly name: string;
  getForecast(query: WeatherForecastQuery): Promise<WeatherForecast>;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: "osm" | "google" | "manual";
  tags?: Record<string, string>;
  elevationMeters?: number;
}

export interface PlaceSearchQuery {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit?: number;
}

export interface PlaceSearchProvider {
  readonly name: string;
  searchNearby(query: PlaceSearchQuery): Promise<PlaceCandidate[]>;
}

export interface RouteQuery {
  origin: Coordinates;
  destination: Coordinates;
  mode: "walking" | "driving" | "cycling";
}

export interface RouteEstimate {
  travelTimeMinutes: number;
  distanceMeters: number;
  summary?: string;
}

export interface RoutingProvider {
  readonly name: string;
  estimateRoute(query: RouteQuery): Promise<RouteEstimate>;
}

export interface GeocodeResult {
  placeName: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
  source: string;
}

export interface GeocodingProvider {
  readonly name: string;
  reverseGeocode(coordinates: Coordinates): Promise<GeocodeResult | null>;
}
