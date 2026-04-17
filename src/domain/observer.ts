export interface ObserverContext {
  latitude: number;
  longitude: number;
  elevationM?: number;
  timezoneOffsetMinutes?: number;
  locationLabel?: string;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export type TravelMode = "walking" | "cycling" | "driving";

export interface RecommendationRequest {
  observer: ObserverContext;
  timeRange: TimeRange;
  travelMode?: TravelMode;
  maxTravelTimeMinutes?: number;
  includeSuppressed?: boolean;
  maxResults?: number;
}
