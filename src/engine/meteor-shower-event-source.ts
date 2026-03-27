import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";
import {
  type MeteorShowerCatalogEntry,
  METEOR_SHOWER_CATALOG,
  materializeMeteorShowerOccurrence
} from "../data/meteor-showers.js";

const intersectsTimeRange = (
  eventStart: Date,
  eventEnd: Date,
  range: TimeRange
): boolean => eventStart.getTime() <= range.end.getTime() && eventEnd.getTime() >= range.start.getTime();

const materializePeakTime = (
  occurrence: ReturnType<typeof materializeMeteorShowerOccurrence>,
  year: number,
  entry: MeteorShowerCatalogEntry
): Date => {
  if (occurrence.peakTimeUtc) {
    return new Date(occurrence.peakTimeUtc);
  }

  return new Date(Date.UTC(year, entry.peakMonth - 1, entry.peakDay, 20, 0, 0));
};

export class MeteorShowerEventSource implements AstronomyEventSource {
  public constructor(
    private readonly catalog: readonly MeteorShowerCatalogEntry[] = METEOR_SHOWER_CATALOG
  ) {}

  public async generateEvents(
    _observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const years = new Set([timeRange.start.getUTCFullYear(), timeRange.end.getUTCFullYear()]);
    const events: AstronomyEventCandidate[] = [];

    for (const year of years) {
      for (const entry of this.catalog) {
        const occurrence = materializeMeteorShowerOccurrence(entry, year);
        const startTime = new Date(occurrence.startTimeUtc);
        const endTime = new Date(occurrence.endTimeUtc);

        if (!intersectsTimeRange(startTime, endTime, timeRange)) {
          continue;
        }

        const peakTime = materializePeakTime(occurrence, year, entry);

        events.push({
          id: occurrence.id,
          eventType: "meteor_shower",
          title: `${occurrence.name} peak`,
          description: `${occurrence.name} meteor shower with radiant near ${occurrence.radiant}. ${occurrence.moonlightNotes}`,
          startTime,
          peakTime,
          endTime,
          sourceType: "curated",
          sourceName: "repo-meteor-shower-catalog",
          confidence: entry.reviewStatus === "reviewed" ? 0.9 : 0.6
        });
      }
    }

    return events;
  }
}
