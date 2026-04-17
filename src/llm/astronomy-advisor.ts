import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { ObserverContext } from "../domain/observer.js";

export interface ReachablePlaceOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  placeType: string;
  travelTimeMinutes: number;
  distanceMeters: number;
  tags?: Record<string, string>;
}

export interface AstronomyNarration {
  shortDescription: string;
  whyItMatters: string;
  viewingAdvice: string;
}

export interface LocationDecision {
  selectedPlaceId: string;
  rationale: string;
}

export interface AstronomyAdvisor {
  chooseLocation(input: {
    observer: ObserverContext;
    event: ScoredAstronomyEvent;
    candidatePlaces: ReachablePlaceOption[];
  }): Promise<LocationDecision>;
  describeEvent(input: {
    observer: ObserverContext;
    event: ScoredAstronomyEvent;
    selectedPlace?: ReachablePlaceOption;
  }): Promise<AstronomyNarration>;
}
