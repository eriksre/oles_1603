import { describe, expect, it } from "vitest";
import type { AstronomyEventCandidate, EventType } from "../../src/domain/events.js";
import type { ObserverContext, TimeRange } from "../../src/domain/observer.js";
import { LocalAstronomyEventSource } from "../../src/providers/astronomy/localAstronomyEventSource.js";

const MINUTE_MS = 60 * 1000;

const sydneyObserver = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevationM: 58
};

const dallasObserver = {
  latitude: 32.7767,
  longitude: -96.797,
  elevationM: 131
};

const bruneiObserver = {
  latitude: 4.5353,
  longitude: 114.7277,
  elevationM: 0
};

const miamiObserver = {
  latitude: 25.7617,
  longitude: -80.1918,
  elevationM: 2
};

function utc(value: string): Date {
  return new Date(value);
}

function minutesBetween(left: Date, right: Date): number {
  return Math.abs(left.getTime() - right.getTime()) / MINUTE_MS;
}

function expectDateWithinMinutes(actual: Date | undefined, expected: string, minutes: number) {
  expect(actual).toBeDefined();
  expect(minutesBetween(actual!, utc(expected))).toBeLessThanOrEqual(minutes);
}

async function generateOne(
  observer: ObserverContext,
  range: TimeRange,
  eventType: EventType,
  options?: ConstructorParameters<typeof LocalAstronomyEventSource>[0]
): Promise<AstronomyEventCandidate> {
  const source = new LocalAstronomyEventSource(options);
  const events = await source.generateEvents(observer, range);
  const matches = events.filter((event) => event.eventType === eventType);

  expect(matches, `expected one ${eventType}`).toHaveLength(1);
  return matches[0];
}

describe("LocalAstronomyEventSource reference events", () => {
  it("matches the January 2025 full moon reference time", async () => {
    const event = await generateOne(
      sydneyObserver,
      {
        start: utc("2025-01-12T00:00:00Z"),
        end: utc("2025-01-14T23:59:59Z")
      },
      "full_moon",
      {
        includeEclipses: false,
        includeCloseApproaches: false,
        includePlanetVisibilityEvents: false,
        includePlanetParades: false
      }
    );

    expect(event.title).toBe("Full moon");
    expectDateWithinMinutes(event.peakTime, "2025-01-13T22:27:00Z", 2);
  });

  it("classifies the November 2025 closest full moon as a supermoon", async () => {
    const event = await generateOne(
      sydneyObserver,
      {
        start: utc("2025-11-01T00:00:00Z"),
        end: utc("2025-11-08T23:59:59Z")
      },
      "supermoon",
      {
        includeEclipses: false,
        includeCloseApproaches: false,
        includePlanetVisibilityEvents: false,
        includePlanetParades: false
      }
    );

    expect(event.title).toBe("Supermoon");
    expectDateWithinMinutes(event.peakTime, "2025-11-05T13:19:00Z", 2);
  });

  it("matches the March 2025 total lunar eclipse global circumstances", async () => {
    const event = await generateOne(
      sydneyObserver,
      {
        start: utc("2025-03-13T00:00:00Z"),
        end: utc("2025-03-15T23:59:59Z")
      },
      "lunar_eclipse",
      {
        includeMoonEvents: false,
        includeCloseApproaches: false,
        includePlanetVisibilityEvents: false,
        includePlanetParades: false
      }
    );

    expect(event.title).toBe("Total lunar eclipse");
    expectDateWithinMinutes(event.startTime, "2025-03-14T03:57:09.4Z", 2);
    expectDateWithinMinutes(event.peakTime, "2025-03-14T06:58:44.5Z", 2);
    expectDateWithinMinutes(event.endTime, "2025-03-14T10:00:31.9Z", 2);
  });

  it("matches the Dallas 2024 total solar eclipse local circumstances", async () => {
    const event = await generateOne(
      dallasObserver,
      {
        start: utc("2024-04-08T00:00:00Z"),
        end: utc("2024-04-09T23:59:59Z")
      },
      "solar_eclipse",
      {
        includeMoonEvents: false,
        includeCloseApproaches: false,
        includePlanetVisibilityEvents: false,
        includePlanetParades: false
      }
    );

    expect(event.title).toBe("Total solar eclipse");
    expectDateWithinMinutes(event.startTime, "2024-04-08T17:23:18Z", 2);
    expectDateWithinMinutes(event.peakTime, "2024-04-08T18:42:38Z", 2);
    expectDateWithinMinutes(event.endTime, "2024-04-08T20:02:40Z", 2);
    expect(event.targetAltitudeDeg).toBeGreaterThan(60);
  });

  it("finds Venus at its January 2025 greatest eastern elongation", async () => {
    const event = await generateOne(
      sydneyObserver,
      {
        start: utc("2025-01-01T00:00:00Z"),
        end: utc("2025-01-15T23:59:59Z")
      },
      "venus_best_visibility",
      {
        includeMoonEvents: false,
        includeEclipses: false,
        includeCloseApproaches: false,
        includePlanetParades: false,
        includeBelowHorizon: true
      }
    );

    expect(event.title).toBe("Venus best evening visibility");
    expect(event.peakTime.toISOString().slice(0, 10)).toBe("2025-01-10");
  });

  it("matches Mercury's March 2025 greatest eastern elongation", async () => {
    const event = await generateOne(
      sydneyObserver,
      {
        start: utc("2025-03-01T00:00:00Z"),
        end: utc("2025-03-12T23:59:59Z")
      },
      "mercury_best_visibility",
      {
        includeMoonEvents: false,
        includeEclipses: false,
        includeCloseApproaches: false,
        includePlanetParades: false,
        includeBelowHorizon: true
      }
    );

    expect(event.title).toBe("Mercury best evening visibility");
    expectDateWithinMinutes(event.peakTime, "2025-03-08T05:59:00Z", 10);
  });

  it("detects the March 2023 Moon and Venus close approach over southeast Asia", async () => {
    const event = await generateOne(
      bruneiObserver,
      {
        start: utc("2023-03-23T00:00:00Z"),
        end: utc("2023-03-25T23:59:59Z")
      },
      "moon_planet_close_approach",
      {
        includeMoonEvents: false,
        includeEclipses: false,
        includePlanetVisibilityEvents: false,
        includePlanetParades: false
      }
    );

    expect(event.title).toBe("Moon with Venus");
    expect(event.peakTime.toISOString().slice(0, 10)).toBe("2023-03-24");
    expect(event.targetAltitudeDeg).toBeGreaterThan(0);
  });

  it("matches three well documented bright-planet conjunctions", async () => {
    const cases = [
      {
        range: {
          start: utc("2020-12-20T00:00:00Z"),
          end: utc("2020-12-22T23:59:59Z")
        },
        title: "Jupiter and Saturn conjunction",
        expectedPeak: "2020-12-21T18:20:00Z",
        toleranceMinutes: 5
      },
      {
        range: {
          start: utc("2023-02-28T00:00:00Z"),
          end: utc("2023-03-03T23:59:59Z")
        },
        title: "Venus and Jupiter conjunction",
        expectedPeak: "2023-03-02T10:39:00Z",
        toleranceMinutes: 12 * 60
      },
      {
        range: {
          start: utc("2024-08-13T00:00:00Z"),
          end: utc("2024-08-15T23:59:59Z")
        },
        title: "Mars and Jupiter conjunction",
        expectedPeak: "2024-08-14T00:00:00Z",
        toleranceMinutes: 24 * 60
      }
    ];

    for (const testCase of cases) {
      const event = await generateOne(
        sydneyObserver,
        testCase.range,
        "planetary_conjunction",
        {
          includeMoonEvents: false,
          includeEclipses: false,
          includePlanetVisibilityEvents: false,
          includePlanetParades: false
        }
      );

      expect(event.title).toBe(testCase.title);
      expectDateWithinMinutes(
        event.peakTime,
        testCase.expectedPeak,
        testCase.toleranceMinutes
      );
    }
  });

  it("detects the February 2025 Miami dark-sky planet parade window", async () => {
    const event = await generateOne(
      miamiObserver,
      {
        start: utc("2025-02-24T22:00:00Z"),
        end: utc("2025-02-25T02:00:00Z")
      },
      "planet_parade",
      {
        includeMoonEvents: false,
        includeEclipses: false,
        includeCloseApproaches: false,
        includePlanetVisibilityEvents: false
      }
    );

    expect(event.title).toContain("Planet parade:");
    expect(event.description).toMatch(/Mercury|Venus|Mars|Jupiter|Saturn/);
    expect(event.startTime.getTime()).toBeLessThanOrEqual(utc("2025-02-25T00:00:00Z").getTime());
    expect(event.endTime.getTime()).toBeGreaterThanOrEqual(utc("2025-02-25T01:00:00Z").getTime());
    expect(event.sunAltitudeDeg).toBeLessThanOrEqual(-6);
  });
});
