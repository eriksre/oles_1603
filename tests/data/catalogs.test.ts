import { describe, expect, it } from "vitest";
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
      radiantRaDeg: 48,
      radiantDecDeg: 58.1,
    });
  });
});
