import { createRequire } from "node:module";
import type * as AstronomyEngine from "astronomy-engine";

import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";
import {
  type MeteorShowerCatalogEntry,
  METEOR_SHOWER_CATALOG,
  materializeMeteorShowerOccurrence
} from "../data/meteor-showers.js";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof AstronomyEngine;

const { Body, Equator, Horizon, Illumination, Observer } = Astronomy;

type AstronomyObserver = InstanceType<typeof Observer>;

const HOUR_MS = 60 * 60 * 1000;
const SAMPLE_MS = 30 * 60 * 1000;
const PEAK_WINDOW_BEFORE_MS = 36 * HOUR_MS;
const PEAK_WINDOW_AFTER_MS = 36 * HOUR_MS;

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

const clampAzimuth = (azimuthDeg: number): number => {
  const normalized = azimuthDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const CARDINAL_LABELS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW"
] as const;

const toDirectionLabel = (azimuthDeg: number): string => {
  const normalized = clampAzimuth(azimuthDeg);
  const index = Math.round(normalized / 22.5) % CARDINAL_LABELS.length;

  return CARDINAL_LABELS[index];
};

const toObserver = (observer: ObserverContext): AstronomyObserver =>
  new Observer(observer.latitude, observer.longitude, observer.elevationM ?? 0);

function buildBodyGeometry(
  body: typeof Body.Sun | typeof Body.Moon,
  time: Date,
  observer: ObserverContext
) {
  const astroObserver = toObserver(observer);
  const eq = Equator(body, time, astroObserver, true, true);
  const hor = Horizon(time, astroObserver, eq.ra, eq.dec, "normal");

  return {
    azimuthDeg: clampAzimuth(hor.azimuth),
    altitudeDeg: hor.altitude
  };
}

function buildRadiantGeometry(
  entry: MeteorShowerCatalogEntry,
  time: Date,
  observer: ObserverContext
) {
  const astroObserver = toObserver(observer);
  const horizon = Horizon(
    time,
    astroObserver,
    entry.radiantRaDeg / 15,
    entry.radiantDecDeg,
    "normal"
  );
  const sun = buildBodyGeometry(Body.Sun, time, observer);
  const moon = buildBodyGeometry(Body.Moon, time, observer);

  return {
    targetAzimuthDeg: clampAzimuth(horizon.azimuth),
    targetAltitudeDeg: horizon.altitude,
    targetDirectionLabel: toDirectionLabel(horizon.azimuth),
    sunAltitudeDeg: sun.altitudeDeg,
    moonAltitudeDeg: moon.altitudeDeg,
    moonIllumination: Illumination(Body.Moon, time).phase_fraction
  };
}

function addLocalBestViewing(
  event: AstronomyEventCandidate,
  entry: MeteorShowerCatalogEntry,
  observer: ObserverContext,
  timeRange: TimeRange
): AstronomyEventCandidate | undefined {
  const windowStart = new Date(
    Math.max(
      event.startTime.getTime(),
      timeRange.start.getTime(),
      event.peakTime.getTime() - PEAK_WINDOW_BEFORE_MS
    )
  );
  const windowEnd = new Date(
    Math.min(
      event.endTime.getTime(),
      timeRange.end.getTime(),
      event.peakTime.getTime() + PEAK_WINDOW_AFTER_MS
    )
  );
  let best:
    | {
        time: Date;
        geometry: ReturnType<typeof buildRadiantGeometry>;
        score: number;
      }
    | undefined;

  for (
    let timeMs = windowStart.getTime();
    timeMs <= windowEnd.getTime();
    timeMs += SAMPLE_MS
  ) {
    const sampleTime = new Date(timeMs);
    const geometry = buildRadiantGeometry(entry, sampleTime, observer);

    if (geometry.targetAltitudeDeg <= 0 || geometry.sunAltitudeDeg > -12) {
      continue;
    }

    const darknessBonus = geometry.sunAltitudeDeg <= -18 ? 10 : 0;
    const score = geometry.targetAltitudeDeg + darknessBonus;

    if (!best || score > best.score) {
      best = {
        time: sampleTime,
        geometry,
        score
      };
    }
  }

  if (!best) {
    return undefined;
  }

  return {
    ...event,
    localBestViewingTime: best.time,
    localBestViewingAzimuthDeg: best.geometry.targetAzimuthDeg,
    localBestViewingAltitudeDeg: best.geometry.targetAltitudeDeg,
    localBestViewingDirectionLabel: best.geometry.targetDirectionLabel,
    localBestViewingSunAltitudeDeg: best.geometry.sunAltitudeDeg,
    localBestViewingMoonAltitudeDeg: best.geometry.moonAltitudeDeg,
    localBestViewingMoonIllumination: best.geometry.moonIllumination,
    instructionText: `At ${best.time.toISOString()}, face ${best.geometry.targetDirectionLabel} and look ${Math.max(
      0,
      Math.round(best.geometry.targetAltitudeDeg)
    )} degrees above the horizon.`
  };
}

export class MeteorShowerEventSource implements AstronomyEventSource {
  public constructor(
    private readonly catalog: readonly MeteorShowerCatalogEntry[] = METEOR_SHOWER_CATALOG
  ) {}

  public async generateEvents(
    observer: ObserverContext,
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
        const peakGeometry = buildRadiantGeometry(entry, peakTime, observer);
        const details = [
          occurrence.expectedZhr ? `ZHR ${occurrence.expectedZhr}` : undefined,
          occurrence.velocityKmS ? `${occurrence.velocityKmS} km/s` : undefined,
          occurrence.parentBody ? `parent ${occurrence.parentBody}` : undefined
        ].filter(Boolean);

        const event = addLocalBestViewing({
          id: occurrence.id,
          eventType: "meteor_shower",
          title: `${occurrence.name} peak`,
          description: `${occurrence.name} meteor shower with radiant near ${occurrence.radiant}. ${details.join(", ")}. ${occurrence.moonlightNotes}`,
          startTime,
          peakTime,
          endTime,
          sourceType: "curated",
          sourceName: "repo-meteor-shower-catalog",
          confidence: entry.reviewStatus === "reviewed" ? 0.9 : 0.6,
          ...peakGeometry
        }, entry, observer, timeRange);

        if (event) {
          events.push(event);
        }
      }
    }

    return events;
  }
}
