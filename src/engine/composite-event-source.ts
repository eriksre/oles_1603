import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";

export class CompositeEventSource implements AstronomyEventSource {
  public constructor(private readonly sources: readonly AstronomyEventSource[]) {}

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const nestedResults = await Promise.all(
      this.sources.map((source) => source.generateEvents(observer, timeRange))
    );

    return nestedResults.flat();
  }
}
