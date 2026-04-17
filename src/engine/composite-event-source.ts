import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";

export interface CompositeEventSourceOptions {
  continueOnSourceError?: boolean;
}

export class CompositeEventSource implements AstronomyEventSource {
  public constructor(
    private readonly sources: readonly AstronomyEventSource[],
    private readonly options: CompositeEventSourceOptions = {}
  ) {}

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    if (this.options.continueOnSourceError) {
      const results = await Promise.allSettled(
        this.sources.map((source) => source.generateEvents(observer, timeRange))
      );

      return results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );
    }

    const nestedResults = await Promise.all(
      this.sources.map((source) => source.generateEvents(observer, timeRange))
    );

    return nestedResults.flat();
  }
}
