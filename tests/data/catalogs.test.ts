import { describe, expect, it } from "vitest";
import {
  DARK_SKY_PLACES,
  findDarkSkyPlacesWithinRadius,
  haversineDistanceMeters,
} from "../../src/data/dark-sky-places.js";
import {
  METEOR_SHOWER_CATALOG,
  getMeteorShowerOccurrencesForYear,
} from "../../src/data/meteor-showers.js";

describe("astronomy reference data", () => {
  it("materializes meteor shower occurrences for a given year", () => {
    const occurrences = getMeteorShowerOccurrencesForYear(2026);

    expect(occurrences).toHaveLength(METEOR_SHOWER_CATALOG.length);
    expect(occurrences.find((entry) => entry.id === "perseids-2026")).toMatchObject({
      name: "Perseids",
      startTimeUtc: "2026-07-17T00:00:00.000Z",
      endTimeUtc: "2026-08-24T00:00:00.000Z",
      radiant: "Perseus",
    });
  });

  it("keeps the dark-sky place catalog queryable even when empty", () => {
    const nearby = findDarkSkyPlacesWithinRadius({
      latitude: -33.8688,
      longitude: 151.2093,
      radiusMeters: 50_000,
    });

    expect(DARK_SKY_PLACES).toEqual([]);
    expect(nearby).toEqual([]);
  });

  it("computes symmetric haversine distances", () => {
    const a = { latitude: -33.8688, longitude: 151.2093 };
    const b = { latitude: -33.86, longitude: 151.2 };

    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
    expect(haversineDistanceMeters(a, a)).toBe(0);
  });
});
