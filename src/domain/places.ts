import type { ObserverContext, TravelMode } from "./observer.js";

export const PLACE_TYPES = [
  "viewpoint",
  "mountain_peak",
  "observation_deck",
  "national_park",
  "city_park",
  "campground",
  "beach"
] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];

export interface PlaceCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM?: number;
  placeType: PlaceType;
  directionOpennessScore?: number;
  tags?: Record<string, string>;
}

export interface TravelEstimate {
  placeId: string;
  distanceM: number;
  travelTimeMinutes: number;
  mode: TravelMode;
}

export interface NearbyPlaceProvider {
  searchNearby(observer: ObserverContext, radiusMeters: number): Promise<PlaceCandidate[]>;
}

export interface TravelTimeProvider {
  estimateTravelTimes(
    observer: ObserverContext,
    places: PlaceCandidate[],
    mode: TravelMode
  ): Promise<TravelEstimate[]>;
}
