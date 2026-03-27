import {
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
  SearchPeakMagnitude
} from "astronomy-engine";

import type { AstronomyEventCandidate } from "../../domain/events.js";
import type { ObserverContext, TimeRange } from "../../domain/observer.js";
import type { AstronomyEventSource } from "../../engine/contracts.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SAMPLE_BODIES = [
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn
] as const;
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

function toObserver(observer: ObserverContext): Observer {
  return new Observer(
    observer.latitude,
    observer.longitude,
    observer.elevationM ?? 0
  );
}

function buildBodyGeometry(
  body: Body,
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
  body1: Body,
  body2: Body,
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
  timeRange: TimeRange
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

      events.push(
        baseEvent({
          eventType,
          title: isSupermoon ? "Supermoon" : "Full moon",
          startTime: quarter.time.date,
          peakTime: quarter.time.date,
          endTime: quarter.time.date,
          ...geometry
        })
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

      events.push(
        baseEvent({
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

      events.push(
        baseEvent({
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
        })
      );
    }

    eclipse = NextLocalSolarEclipse(eclipse.peak.time, astroObserver);
  }

  return events;
}

function buildMaxVisibilityEvents(
  observer: ObserverContext,
  timeRange: TimeRange
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

      events.push(
        baseEvent({
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
        })
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
    events.push(
      baseEvent({
        eventType: "venus_best_visibility",
        title: "Venus near peak brightness",
        description: "Venus appears close to its brightest as seen from Earth.",
        startTime: event.time.date,
        peakTime: event.time.date,
        endTime: event.time.date,
        confidence: 0.9,
        ...geometry
      })
    );

    venusCursor = new Date(event.time.date.getTime() + 20 * DAY_MS);
  }

  return events;
}

function buildCloseApproachEvents(
  observer: ObserverContext,
  timeRange: TimeRange
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
            events.push(
              baseEvent({
                eventType: config.eventType,
                title: config.title,
                description: `${config.body1} and ${config.body2} make a close apparent approach.`,
                startTime: refinedPeak,
                peakTime: refinedPeak,
                endTime: refinedPeak,
                confidence: 0.88,
                ...geometry
              })
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

      events.push(
        baseEvent({
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
        })
      );
      active = undefined;
    }
  }

  return events;
}

export interface LocalAstronomyEventSourceOptions {
  includeMoonEvents?: boolean;
  includeEclipses?: boolean;
  includeCloseApproaches?: boolean;
  includePlanetVisibilityEvents?: boolean;
  includePlanetParades?: boolean;
}

export class LocalAstronomyEventSource implements AstronomyEventSource {
  public constructor(
    private readonly options: LocalAstronomyEventSourceOptions = {}
  ) {}

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const events: AstronomyEventCandidate[] = [];

    if (this.options.includeMoonEvents ?? true) {
      events.push(...buildFullMoonEvents(observer, timeRange));
    }

    if (this.options.includeEclipses ?? true) {
      events.push(...buildLunarEclipseEvents(observer, timeRange));
      events.push(...buildLocalSolarEclipseEvents(observer, timeRange));
    }

    if (this.options.includePlanetVisibilityEvents ?? true) {
      events.push(...buildMaxVisibilityEvents(observer, timeRange));
    }

    if (this.options.includeCloseApproaches ?? true) {
      events.push(...buildCloseApproachEvents(observer, timeRange));
    }

    if (this.options.includePlanetParades ?? true) {
      events.push(...buildPlanetParades(observer, timeRange));
    }

    return events.sort(
      (left, right) => left.peakTime.getTime() - right.peakTime.getTime()
    );
  }
}
