import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";

export interface AstronomyEventSource {
  generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]>;
}
