import { createRequire } from "node:module";
import type * as AstronomyEngine from "astronomy-engine";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof AstronomyEngine;

const {
  AngleBetween,
  ApsisKind,
  Body,
  Equator,
  Horizon,
  Illumination,
  NextLocalSolarEclipse,
  NextLunarApsis,
  NextLunarEclipse,
  NextMoonQuarter,
  Observer,
  SearchLocalSolarEclipse,
  SearchLunarApsis,
  SearchLunarEclipse,
  SearchMaxElongation,
  SearchMoonQuarter,
  SearchPeakMagnitude,
  SearchRelativeLongitude
} = Astronomy;

type AstronomyBody = (typeof Body)[keyof typeof Body];
type AstronomyObserver = InstanceType<typeof Observer>;

import type { AstronomyEventCandidate } from "../../domain/events.js";
import type { ObserverContext, TimeRange } from "../../domain/observer.js";
import type { AstronomyEventSource } from "../../engine/contracts.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const VISIBILITY_SAMPLE_MS = 15 * 60 * 1000;
const SAMPLE_BODIES = [
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn
] as const;
const OPPOSITION_BODIES = [Body.Mars, Body.Jupiter, Body.Saturn] as const;
const MOON_CLOSE_APPROACH_BODIES = [Body.Venus, Body.Jupiter, Body.Saturn] as const;
const PLANETARY_CONJUNCTION_PAIRS = [
  [Body.Mercury, Body.Venus],
  [Body.Venus, Body.Jupiter],
  [Body.Mars, Body.Jupiter],
  [Body.Jupiter, Body.Saturn]
] as const;
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

function clampAzimuth(azimuthDeg: number): number {
  const normalized = azimuthDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function toDirectionLabel(azimuthDeg: number): string {
  const normalized = clampAzimuth(azimuthDeg);
  const index = Math.round(normalized / 22.5) % CARDINAL_LABELS.length;
  return CARDINAL_LABELS[index];
}

function toObserver(observer: ObserverContext): AstronomyObserver {
  return new Observer(
    observer.latitude,
    observer.longitude,
    observer.elevationM ?? 0
  );
}

function buildBodyGeometry(
  body: AstronomyBody,
  time: Date,
  observer: ObserverContext
): Pick<
  AstronomyEventCandidate,
  | "targetAzimuthDeg"
  | "targetAltitudeDeg"
  | "targetDirectionLabel"
  | "sunAltitudeDeg"
  | "moonAltitudeDeg"
  | "moonIllumination"
> {
  const astroObserver = toObserver(observer);
  const bodyEq = Equator(body, time, astroObserver, true, true);
  const bodyHor = Horizon(
    time,
    astroObserver,
    bodyEq.ra,
    bodyEq.dec,
    "normal"
  );
  const sunEq = Equator(Body.Sun, time, astroObserver, true, true);
  const sunHor = Horizon(time, astroObserver, sunEq.ra, sunEq.dec, "normal");
  const moonEq = Equator(Body.Moon, time, astroObserver, true, true);
  const moonHor = Horizon(
    time,
    astroObserver,
    moonEq.ra,
    moonEq.dec,
    "normal"
  );

  return {
    targetAzimuthDeg: clampAzimuth(bodyHor.azimuth),
    targetAltitudeDeg: bodyHor.altitude,
    targetDirectionLabel: toDirectionLabel(bodyHor.azimuth),
    sunAltitudeDeg: sunHor.altitude,
    moonAltitudeDeg: moonHor.altitude,
    moonIllumination: Illumination(Body.Moon, time).phase_fraction
  };
}

function pairSeparationDeg(
  body1: AstronomyBody,
  body2: AstronomyBody,
  time: Date,
  observer: ObserverContext
): number {
  const astroObserver = toObserver(observer);
  const eq1 = Equator(body1, time, astroObserver, true, true);
  const eq2 = Equator(body2, time, astroObserver, true, true);

  return AngleBetween(eq1.vec, eq2.vec);
}

function refineMinimum(
  lower: Date,
  upper: Date,
  scoreAt: (time: Date) => number,
  iterations = 25
): Date {
  let left = lower.getTime();
  let right = upper.getTime();

  for (let i = 0; i < iterations; i += 1) {
    const leftThird = left + (right - left) / 3;
    const rightThird = right - (right - left) / 3;

    if (scoreAt(new Date(leftThird)) <= scoreAt(new Date(rightThird))) {
      right = rightThird;
    } else {
      left = leftThird;
    }
  }

  return new Date((left + right) / 2);
}

function baseEvent(
  input: Omit<
    AstronomyEventCandidate,
    | "description"
    | "sourceType"
    | "sourceName"
    | "confidence"
    | "id"
    | "instructionText"
  > & { confidence?: number; description?: string }
): AstronomyEventCandidate {
  return {
    ...input,
    id: `${input.eventType}:${input.peakTime.toISOString()}`,
    description: input.description ?? input.title,
    sourceType: "derived",
    sourceName: "astronomy-engine",
    confidence: input.confidence ?? 0.9,
    instructionText: input.targetDirectionLabel
      ? `Face ${input.targetDirectionLabel} and look ${Math.max(
          0,
          Math.round(input.targetAltitudeDeg ?? 0)
        )} degrees above the horizon.`
      : undefined
  };
}

function instantVisibilityWindow(peakTime: Date, hours: number) {
  const halfWindowMs = hours * HOUR_MS;

  return {
    start: new Date(peakTime.getTime() - halfWindowMs),
    end: new Date(peakTime.getTime() + halfWindowMs)
  };
}

function addLocalBestViewing(
  event: AstronomyEventCandidate,
  targetBodies: readonly AstronomyBody[],
  observer: ObserverContext,
  window: { start: Date; end: Date }
): AstronomyEventCandidate {
  let best:
    | {
        time: Date;
        primaryGeometry: ReturnType<typeof buildBodyGeometry>;
        minimumAltitudeDeg: number;
      }
    | undefined;
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();

  if (targetBodies.length === 0 || endMs < startMs) {
    return event;
  }

  for (let timeMs = startMs; timeMs <= endMs; timeMs += VISIBILITY_SAMPLE_MS) {
    const sampleTime = new Date(timeMs);
    const geometries = targetBodies.map((body) =>
      buildBodyGeometry(body, sampleTime, observer)
    );
    const minimumAltitudeDeg = Math.min(
      ...geometries.map((geometry) => geometry.targetAltitudeDeg ?? -90)
    );
    const sunAltitudeDeg = geometries[0]?.sunAltitudeDeg ?? 90;

    if (
      minimumAltitudeDeg > 0 &&
      isDarkEnoughForEvent(event, sunAltitudeDeg) &&
      (!best || minimumAltitudeDeg > best.minimumAltitudeDeg)
    ) {
      best = {
        time: sampleTime,
        primaryGeometry: geometries[0],
        minimumAltitudeDeg
      };
    }
  }

  if (!best) {
    return event;
  }

  return {
    ...event,
    localBestViewingTime: best.time,
    localBestViewingAzimuthDeg: best.primaryGeometry.targetAzimuthDeg,
    localBestViewingAltitudeDeg: best.primaryGeometry.targetAltitudeDeg,
    localBestViewingDirectionLabel: best.primaryGeometry.targetDirectionLabel,
    localBestViewingSunAltitudeDeg: best.primaryGeometry.sunAltitudeDeg,
    localBestViewingMoonAltitudeDeg: best.primaryGeometry.moonAltitudeDeg,
    localBestViewingMoonIllumination: best.primaryGeometry.moonIllumination,
    instructionText: best.primaryGeometry.targetDirectionLabel
      ? `At ${best.time.toISOString()}, face ${best.primaryGeometry.targetDirectionLabel} and look ${Math.max(
          0,
          Math.round(best.primaryGeometry.targetAltitudeDeg ?? 0)
        )} degrees above the horizon.`
      : event.instructionText
  };
}

function isDarkEnoughForEvent(
  event: Pick<AstronomyEventCandidate, "eventType">,
  sunAltitudeDeg: number
): boolean {
  switch (event.eventType) {
    case "solar_eclipse":
      return sunAltitudeDeg > 0;
    case "full_moon":
    case "supermoon":
    case "lunar_eclipse":
      return sunAltitudeDeg <= 0;
    case "mercury_best_visibility":
    case "venus_best_visibility":
    case "moon_planet_close_approach":
    case "planet_conjunction":
    case "planetary_conjunction":
    case "planet_opposition":
      return sunAltitudeDeg <= -6;
    case "planet_parade":
    case "meteor_shower":
    case "aurora":
    case "iss_pass":
      return sunAltitudeDeg <= -6;
    default:
      return sunAltitudeDeg <= -6;
  }
}

function nearestLunarApsis(time: Date) {
  const searchStart = new Date(time.getTime() - 16 * DAY_MS);
  let apsis = SearchLunarApsis(searchStart);
  let nearest = apsis;

  while (apsis.time.date <= new Date(time.getTime() + 16 * DAY_MS)) {
    if (
      Math.abs(apsis.time.date.getTime() - time.getTime()) <
      Math.abs(nearest.time.date.getTime() - time.getTime())
    ) {
      nearest = apsis;
    }

    apsis = NextLunarApsis(apsis);
  }

  return nearest;
}

function buildFullMoonEvents(
  observer: ObserverContext,
  timeRange: TimeRange,
  visibilityWindowHours: number
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];
  let quarter = SearchMoonQuarter(new Date(timeRange.start.getTime() - 35 * DAY_MS));

  while (quarter.time.date <= timeRange.end) {
    if (quarter.quarter === 2 && quarter.time.date >= timeRange.start) {
      const apsis = nearestLunarApsis(quarter.time.date);
      const isSupermoon =
        apsis.kind === ApsisKind.Pericenter &&
        Math.abs(apsis.time.date.getTime() - quarter.time.date.getTime()) <=
          36 * HOUR_MS;
      const geometry = buildBodyGeometry(Body.Moon, quarter.time.date, observer);
      const eventType = isSupermoon ? "supermoon" : "full_moon";

      const event = baseEvent({
          eventType,
          title: isSupermoon ? "Supermoon" : "Full moon",
          startTime: quarter.time.date,
          peakTime: quarter.time.date,
          endTime: quarter.time.date,
          ...geometry
        });

      events.push(
        addLocalBestViewing(
          event,
          [Body.Moon],
          observer,
          instantVisibilityWindow(event.peakTime, visibilityWindowHours)
        )
      );
    }

    quarter = NextMoonQuarter(quarter);
  }

  return events;
}

function buildLunarEclipseEvents(
  observer: ObserverContext,
  timeRange: TimeRange
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];
  let eclipse = SearchLunarEclipse(new Date(timeRange.start.getTime() - DAY_MS));

  while (eclipse.peak.date <= timeRange.end) {
    if (eclipse.peak.date >= timeRange.start) {
      const peakTime = eclipse.peak.date;
      const geometry = buildBodyGeometry(Body.Moon, peakTime, observer);

      const event = baseEvent({
          eventType: "lunar_eclipse",
          title:
            eclipse.kind === "total"
              ? "Total lunar eclipse"
              : eclipse.kind === "partial"
                ? "Partial lunar eclipse"
                : "Penumbral lunar eclipse",
          description: "The Moon passes through Earth's shadow.",
          startTime: new Date(peakTime.getTime() - eclipse.sd_penum * 60_000),
          peakTime,
          endTime: new Date(peakTime.getTime() + eclipse.sd_penum * 60_000),
          confidence: eclipse.kind === "penumbral" ? 0.6 : 0.98,
          ...geometry
        });

      events.push(
        addLocalBestViewing(event, [Body.Moon], observer, {
          start: event.startTime,
          end: event.endTime
        })
      );
    }

    eclipse = NextLunarEclipse(eclipse.peak);
  }

  return events;
}

function buildLocalSolarEclipseEvents(
  observer: ObserverContext,
  timeRange: TimeRange
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];
  const astroObserver = toObserver(observer);
  let eclipse = SearchLocalSolarEclipse(timeRange.start, astroObserver);

  while (eclipse.peak.time.date <= timeRange.end) {
    if (eclipse.peak.time.date >= timeRange.start) {
      const peakTime = eclipse.peak.time.date;
      const geometry = buildBodyGeometry(Body.Sun, peakTime, observer);

      const event = baseEvent({
          eventType: "solar_eclipse",
          title:
            eclipse.kind === "total"
              ? "Total solar eclipse"
              : eclipse.kind === "annular"
                ? "Annular solar eclipse"
                : "Partial solar eclipse",
          description: "The Moon crosses in front of the Sun.",
          startTime: eclipse.partial_begin.time.date,
          peakTime,
          endTime: eclipse.partial_end.time.date,
          confidence: eclipse.peak.altitude > 0 ? 0.98 : 0.5,
          ...geometry
        });

      events.push(
        addLocalBestViewing(event, [Body.Sun], observer, {
          start: event.startTime,
          end: event.endTime
        })
      );
    }

    eclipse = NextLocalSolarEclipse(eclipse.peak.time, astroObserver);
  }

  return events;
}

function buildMaxVisibilityEvents(
  observer: ObserverContext,
  timeRange: TimeRange,
  visibilityWindowHours: number
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];

  for (const body of [Body.Mercury, Body.Venus] as const) {
    let cursor = new Date(timeRange.start);

    while (cursor <= timeRange.end) {
      const event = SearchMaxElongation(body, cursor);

      if (event.time.date > timeRange.end) {
        break;
      }

      const geometry = buildBodyGeometry(body, event.time.date, observer);

      const appEvent = baseEvent({
          eventType:
            body === Body.Mercury
              ? "mercury_best_visibility"
              : "venus_best_visibility",
          title: `${body} best ${event.visibility} visibility`,
          description: `${body} reaches maximum elongation and is best placed for viewing.`,
          startTime: event.time.date,
          peakTime: event.time.date,
          endTime: event.time.date,
          confidence: 0.86,
          ...geometry
        });

      events.push(
        addLocalBestViewing(
          appEvent,
          [body],
          observer,
          instantVisibilityWindow(appEvent.peakTime, visibilityWindowHours)
        )
      );

      cursor = new Date(event.time.date.getTime() + 2 * DAY_MS);
    }
  }

  let venusCursor = new Date(timeRange.start);
  while (venusCursor <= timeRange.end) {
    const event = SearchPeakMagnitude(Body.Venus, venusCursor);

    if (event.time.date > timeRange.end) {
      break;
    }

    const geometry = buildBodyGeometry(Body.Venus, event.time.date, observer);
    const appEvent = baseEvent({
        eventType: "venus_best_visibility",
        title: "Venus near peak brightness",
        description: "Venus appears close to its brightest as seen from Earth.",
        startTime: event.time.date,
        peakTime: event.time.date,
        endTime: event.time.date,
        confidence: 0.9,
        ...geometry
      });

    events.push(
      addLocalBestViewing(
        appEvent,
        [Body.Venus],
        observer,
        instantVisibilityWindow(appEvent.peakTime, visibilityWindowHours)
      )
    );

    venusCursor = new Date(event.time.date.getTime() + 20 * DAY_MS);
  }

  return events;
}

function buildPlanetOppositionEvents(
  observer: ObserverContext,
  timeRange: TimeRange,
  visibilityWindowHours: number
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];

  for (const body of OPPOSITION_BODIES) {
    let cursor = new Date(timeRange.start);

    while (cursor <= timeRange.end) {
      const oppositionTime = SearchRelativeLongitude(body, 0, cursor).date;

      if (oppositionTime > timeRange.end) {
        break;
      }

      if (oppositionTime >= timeRange.start) {
        const illumination = Illumination(body, oppositionTime);
        const geometry = buildBodyGeometry(body, oppositionTime, observer);
        const appEvent = baseEvent({
          eventType: "planet_opposition",
          title: `${body} at opposition`,
          description: `${body} is opposite the Sun in Earth's sky and is well placed for all-night viewing.`,
          startTime: oppositionTime,
          peakTime: oppositionTime,
          endTime: oppositionTime,
          confidence: 0.9,
          ...geometry
        });

        events.push(
          addLocalBestViewing(
            {
              ...appEvent,
              description: `${appEvent.description} Approximate magnitude: ${illumination.mag.toFixed(1)}.`
            },
            [body],
            observer,
            instantVisibilityWindow(appEvent.peakTime, visibilityWindowHours)
          )
        );
      }

      cursor = new Date(oppositionTime.getTime() + 30 * DAY_MS);
    }
  }

  return events;
}

function buildCloseApproachEvents(
  observer: ObserverContext,
  timeRange: TimeRange,
  visibilityWindowHours: number
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];
  const searchConfigs = [
    ...MOON_CLOSE_APPROACH_BODIES.map((body) => ({
      body1: Body.Moon,
      body2: body,
      thresholdDeg: 5,
      eventType: "moon_planet_close_approach" as const,
      title: `Moon with ${body}`
    })),
    ...PLANETARY_CONJUNCTION_PAIRS.map(([body1, body2]) => ({
      body1,
      body2,
      thresholdDeg: 3,
      eventType: "planetary_conjunction" as const,
      title: `${body1} and ${body2} conjunction`
    }))
  ];
  const stepMs = 6 * HOUR_MS;

  for (const config of searchConfigs) {
    const samples: Array<{ time: Date; separationDeg: number }> = [];

    for (
      let timeMs = timeRange.start.getTime();
      timeMs <= timeRange.end.getTime();
      timeMs += stepMs
    ) {
      const sampleTime = new Date(timeMs);
      samples.push({
        time: sampleTime,
        separationDeg: pairSeparationDeg(
          config.body1,
          config.body2,
          sampleTime,
          observer
        )
      });
    }

    for (let i = 1; i < samples.length - 1; i += 1) {
      const previous = samples[i - 1];
      const current = samples[i];
      const next = samples[i + 1];

      if (
        current.separationDeg <= previous.separationDeg &&
        current.separationDeg <= next.separationDeg &&
        current.separationDeg <= config.thresholdDeg + 2
      ) {
        const refinedPeak = refineMinimum(
          previous.time,
          next.time,
          (time) =>
            pairSeparationDeg(config.body1, config.body2, time, observer)
        );
        const separationDeg = pairSeparationDeg(
          config.body1,
          config.body2,
          refinedPeak,
          observer
        );

        if (separationDeg <= config.thresholdDeg) {
          const geometry = buildBodyGeometry(config.body1, refinedPeak, observer);
          const lastEvent = events.at(-1);

          if (
            !lastEvent ||
            Math.abs(lastEvent.peakTime.getTime() - refinedPeak.getTime()) >
              12 * HOUR_MS
          ) {
            const event = baseEvent({
                eventType: config.eventType,
                title: config.title,
                description: `${config.body1} and ${config.body2} make a close apparent approach.`,
                startTime: refinedPeak,
                peakTime: refinedPeak,
                endTime: refinedPeak,
                confidence: 0.88,
                ...geometry
              });

            events.push(
              addLocalBestViewing(
                event,
                [config.body1, config.body2],
                observer,
                instantVisibilityWindow(event.peakTime, visibilityWindowHours)
              )
            );
          }
        }
      }
    }
  }

  return events;
}

function getVisiblePlanetsAtTime(
  observer: ObserverContext,
  time: Date,
  minimumAltitudeDeg: number,
  maximumSunAltitudeDeg: number
) {
  const sunGeometry = buildBodyGeometry(Body.Sun, time, observer);
  if ((sunGeometry.sunAltitudeDeg ?? 0) > maximumSunAltitudeDeg) {
    return [];
  }

  return SAMPLE_BODIES.map((body) => ({
    body,
    geometry: buildBodyGeometry(body, time, observer)
  })).filter((entry) => (entry.geometry.targetAltitudeDeg ?? -90) >= minimumAltitudeDeg);
}

function buildPlanetParades(
  observer: ObserverContext,
  timeRange: TimeRange
): AstronomyEventCandidate[] {
  const events: AstronomyEventCandidate[] = [];
  const stepMs = 30 * 60_000;
  let active:
    | {
        start: Date;
        end: Date;
        peak: Date;
        peakBodies: Array<ReturnType<typeof getVisiblePlanetsAtTime>[number]>;
      }
    | undefined;

  for (
    let timeMs = timeRange.start.getTime();
    timeMs <= timeRange.end.getTime();
    timeMs += stepMs
  ) {
    const sampleTime = new Date(timeMs);
    const bodies = getVisiblePlanetsAtTime(observer, sampleTime, 10, -6);

    if (bodies.length >= 3) {
      if (!active) {
        active = {
          start: sampleTime,
          end: sampleTime,
          peak: sampleTime,
          peakBodies: bodies
        };
      } else {
        active.end = sampleTime;
        if (bodies.length > active.peakBodies.length) {
          active.peak = sampleTime;
          active.peakBodies = bodies;
        }
      }
    } else if (active) {
      const azimuths = active.peakBodies
        .map((body) => body.geometry.targetAzimuthDeg)
        .filter((value): value is number => value !== undefined);
      const altitudes = active.peakBodies
        .map((body) => body.geometry.targetAltitudeDeg)
        .filter((value): value is number => value !== undefined);
      const representative = active.peakBodies[0]?.geometry;

      const event = baseEvent({
          eventType: "planet_parade",
          title: "Planet parade",
          description: `Multiple bright planets are visible together.`,
          startTime: active.start,
          peakTime: active.peak,
          endTime: active.end,
          confidence: 0.82,
          targetAzimuthDeg: representative?.targetAzimuthDeg,
          targetAltitudeDeg:
            altitudes.length > 0
              ? Math.max(...altitudes)
              : representative?.targetAltitudeDeg,
          targetDirectionLabel: representative?.targetDirectionLabel,
          azimuthSpanStartDeg:
            azimuths.length > 0 ? Math.min(...azimuths) : undefined,
          azimuthSpanEndDeg:
            azimuths.length > 0 ? Math.max(...azimuths) : undefined,
          sunAltitudeDeg: representative?.sunAltitudeDeg,
          moonAltitudeDeg: representative?.moonAltitudeDeg,
          moonIllumination: representative?.moonIllumination
        });

      events.push({
        ...event,
        localBestViewingTime: event.peakTime,
        localBestViewingAzimuthDeg: event.targetAzimuthDeg,
        localBestViewingAltitudeDeg: event.targetAltitudeDeg,
        localBestViewingDirectionLabel: event.targetDirectionLabel,
        localBestViewingSunAltitudeDeg: event.sunAltitudeDeg,
        localBestViewingMoonAltitudeDeg: event.moonAltitudeDeg,
        localBestViewingMoonIllumination: event.moonIllumination
      });
      active = undefined;
    }
  }

  return events;
}

export interface LocalAstronomyEventSourceOptions {
  includeMoonEvents?: boolean;
  includeEclipses?: boolean;
  includeCloseApproaches?: boolean;
  includePlanetOppositions?: boolean;
  includePlanetVisibilityEvents?: boolean;
  includePlanetParades?: boolean;
  includeBelowHorizon?: boolean;
  visibilityWindowHours?: number;
}

function isAboveHorizon(event: AstronomyEventCandidate): boolean {
  return (event.localBestViewingAltitudeDeg ?? Number.NEGATIVE_INFINITY) > 0;
}

export class AstronomyEngineEventSource implements AstronomyEventSource {
  public constructor(
    private readonly options: LocalAstronomyEventSourceOptions = {}
  ) {}

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const events: AstronomyEventCandidate[] = [];
    const visibilityWindowHours = this.options.visibilityWindowHours ?? 24;

    if (this.options.includeMoonEvents ?? true) {
      events.push(...buildFullMoonEvents(observer, timeRange, visibilityWindowHours));
    }

    if (this.options.includeEclipses ?? true) {
      events.push(...buildLunarEclipseEvents(observer, timeRange));
      events.push(...buildLocalSolarEclipseEvents(observer, timeRange));
    }

    if (this.options.includePlanetVisibilityEvents ?? true) {
      events.push(
        ...buildMaxVisibilityEvents(observer, timeRange, visibilityWindowHours)
      );
    }

    if (this.options.includePlanetOppositions ?? true) {
      events.push(
        ...buildPlanetOppositionEvents(observer, timeRange, visibilityWindowHours)
      );
    }

    if (this.options.includeCloseApproaches ?? true) {
      events.push(
        ...buildCloseApproachEvents(observer, timeRange, visibilityWindowHours)
      );
    }

    if (this.options.includePlanetParades ?? true) {
      events.push(...buildPlanetParades(observer, timeRange));
    }

    const sortedEvents = events.sort(
      (left, right) => left.peakTime.getTime() - right.peakTime.getTime()
    );

    return this.options.includeBelowHorizon
      ? sortedEvents
      : sortedEvents.filter(isAboveHorizon);
  }
}

export class LocalAstronomyEventSource extends AstronomyEngineEventSource {}
