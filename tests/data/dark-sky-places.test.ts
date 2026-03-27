import { describe, expect, it } from "vitest";

import { DARK_SKY_PLACES, findDarkSkyPlacesWithinRadius, haversineDistanceMeters } from "../../src/data/dark-sky-places.js";

describe("dark sky place scaffolding", () => {
  it("starts as an empty curated catalog", () => {
    expect(DARK_SKY_PLACES).toHaveLength(0);
  });

  it("computes distances in a stable way", () => {
    const distance = haversineDistanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 }
    );

    expect(distance).toBeGreaterThan(100_000);
    expect(distance).toBeLessThan(120_000);
  });

  it("returns no results when the catalog is empty", () => {
    expect(
      findDarkSkyPlacesWithinRadius({
        latitude: -33.8688,
        longitude: 151.2093,
        radiusMeters: 10_000
      })
    ).toEqual([]);
  });
});
