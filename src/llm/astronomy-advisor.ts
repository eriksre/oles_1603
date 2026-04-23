import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { ObserverContext } from "../domain/observer.js";

export interface AstronomyNarration {
  shortDescription: string;
  whyItMatters: string;
  viewingAdvice: string;
}

export interface AstronomyAdvisor {
  describeEvent(input: {
    observer: ObserverContext;
    event: ScoredAstronomyEvent;
  }): Promise<AstronomyNarration>;
}
