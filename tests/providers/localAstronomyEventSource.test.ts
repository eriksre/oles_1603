import { describe, expect, it } from "vitest";
import { LocalAstronomyEventSource } from "../../src/providers/astronomy/localAstronomyEventSource.js";

const sydneyObserver = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevationM: 58
};

const miamiObserver = {
  latitude: 25.7617,
  longitude: -80.1918,
  elevationM: 2
};

describe("LocalAstronomyEventSource", () => {
  it("derives full moons and lunar eclipses locally for a month window", async () => {
    const source = new LocalAstronomyEventSource({
      includePlanetParades: false,
      includeCloseApproaches: false
    });

    const events = await source.generateEvents(sydneyObserver, {
      start: new Date("2025-03-01T00:00:00Z"),
      end: new Date("2025-03-31T23:59:59Z")
    });

    const eventTypes = events.map((event) => event.eventType);

    expect(eventTypes).toContain("full_moon");
    expect(eventTypes).toContain("lunar_eclipse");

    const eclipse = events.find((event) => event.eventType === "lunar_eclipse");
    expect(eclipse?.title).toContain("lunar eclipse");
    expect(eclipse?.peakTime.toISOString()).toBe("2025-03-14T06:58:42.343Z");
    expect(eclipse?.targetAltitudeDeg).toBeLessThan(0);
    expect(eclipse?.localBestViewingAltitudeDeg).toBeGreaterThan(0);
  });

  it("suppresses instant events when no local above-horizon viewing time exists in the configured window", async () => {
    const source = new LocalAstronomyEventSource({
      includeEclipses: false,
      includeCloseApproaches: false,
      includePlanetVisibilityEvents: false,
      includePlanetParades: false,
      visibilityWindowHours: 0.01
    });

    const events = await source.generateEvents(sydneyObserver, {
      start: new Date("2025-03-01T00:00:00Z"),
      end: new Date("2025-03-31T23:59:59Z")
    });

    expect(events.map((event) => event.eventType)).not.toContain("full_moon");
  });

  it("finds locally-derived best visibility windows for inner planets", async () => {
    const source = new LocalAstronomyEventSource({
      includePlanetParades: false,
      includeMoonEvents: false,
      includeEclipses: false,
      includeCloseApproaches: false
    });

    const events = await source.generateEvents(sydneyObserver, {
      start: new Date("2025-01-01T00:00:00Z"),
      end: new Date("2025-01-31T23:59:59Z")
    });

    const venusEvent = events.find(
      (event) => event.eventType === "venus_best_visibility"
    );

    expect(venusEvent).toBeDefined();
    expect(venusEvent?.title).toContain("Venus");
    expect(venusEvent?.peakTime.toISOString()).toBe("2025-01-10T04:57:09.665Z");
  });

  it("derives bright planet oppositions locally", async () => {
    const source = new LocalAstronomyEventSource({
      includeMoonEvents: false,
      includeEclipses: false,
      includeCloseApproaches: false,
      includePlanetVisibilityEvents: false,
      includePlanetParades: false
    });

    const events = await source.generateEvents(sydneyObserver, {
      start: new Date("2024-12-01T00:00:00Z"),
      end: new Date("2024-12-15T23:59:59Z")
    });

    const opposition = events.find(
      (event) => event.eventType === "planet_opposition"
    );

    expect(opposition).toBeDefined();
    expect(opposition?.title).toBe("Jupiter at opposition");
    expect(opposition?.localBestViewingTime).toBeDefined();
    expect(opposition?.localBestViewingAltitudeDeg).toBeGreaterThan(0);
  });

  it("detects local moon-planet close approaches without an external API", async () => {
    const source = new LocalAstronomyEventSource({
      includePlanetParades: false,
      includeMoonEvents: false,
      includeEclipses: false,
      includePlanetVisibilityEvents: false
    });

    const events = await source.generateEvents(sydneyObserver, {
      start: new Date("2025-06-01T00:00:00Z"),
      end: new Date("2025-06-30T23:59:59Z")
    });

    const closeApproach = events.find(
      (event) => event.eventType === "moon_planet_close_approach"
    );

    expect(closeApproach).toBeDefined();
    expect(closeApproach?.title).toContain("Moon with");
    expect(closeApproach?.targetAzimuthDeg).toBeDefined();
    expect(closeApproach?.targetDirectionLabel).toBeDefined();
  });

  it("keeps planet parade windows stable when the requested range shifts by a few minutes", async () => {
    const source = new LocalAstronomyEventSource({
      includeMoonEvents: false,
      includeEclipses: false,
      includeCloseApproaches: false,
      includePlanetVisibilityEvents: false
    });

    const exactRangeEvents = await source.generateEvents(miamiObserver, {
      start: new Date("2025-02-24T22:00:00Z"),
      end: new Date("2025-03-03T22:00:00Z")
    });
    const shiftedRangeEvents = await source.generateEvents(miamiObserver, {
      start: new Date("2025-02-24T22:05:00Z"),
      end: new Date("2025-03-03T22:05:00Z")
    });

    const summarize = (events: typeof exactRangeEvents) =>
      events
        .filter((event) => event.eventType === "planet_parade")
        .map((event) => ({
          title: event.title,
          startTime: event.startTime.toISOString(),
          peakTime: event.peakTime.toISOString(),
          endTime: event.endTime.toISOString()
        }));

    expect(summarize(shiftedRangeEvents)).toEqual(summarize(exactRangeEvents));
  });
});
