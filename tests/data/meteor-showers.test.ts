import { describe, expect, it } from "vitest";

import {
  getMeteorShowerOccurrencesForYear,
  METEOR_SHOWER_CATALOG,
  materializeMeteorShowerOccurrence
} from "../../src/data/meteor-showers.js";

describe("meteor shower catalog", () => {
  it("contains the expected starter shower set", () => {
    expect(METEOR_SHOWER_CATALOG.map((entry) => entry.id)).toEqual([
      "quadrantids",
      "lyrids",
      "eta-aquariids",
      "perseids",
      "orionids",
      "leonids",
      "geminids",
      "ursids"
    ]);
  });

  it("materializes a yearly occurrence", () => {
    const occurrence = materializeMeteorShowerOccurrence(METEOR_SHOWER_CATALOG[3], 2026);

    expect(occurrence).toMatchObject({
      id: "perseids-2026",
      name: "Perseids",
      startTimeUtc: "2026-07-17T00:00:00.000Z",
      endTimeUtc: "2026-08-24T00:00:00.000Z",
      radiant: "Perseus"
    });
  });

  it("returns all yearly occurrences", () => {
    expect(getMeteorShowerOccurrencesForYear(2026)).toHaveLength(METEOR_SHOWER_CATALOG.length);
  });
});
