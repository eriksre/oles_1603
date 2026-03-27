import { describe, expect, it } from "vitest";
import { LocalAstronomyEventSource } from "../../src/providers/astronomy/localAstronomyEventSource.js";

const sydneyObserver = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevationM: 58
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
});
