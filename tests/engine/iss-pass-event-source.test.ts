import { describe, expect, it } from "vitest";

import {
  IssPassEventSource,
  normalizeCelesTrakOmmPayload
} from "../../src/engine/iss-pass-event-source.js";

const issOmmPayload = [
  {
    OBJECT_NAME: "ISS (ZARYA)",
    OBJECT_ID: "1998-067A",
    EPOCH: "2026-04-16T20:16:06.009600",
    MEAN_MOTION: 15.48789484,
    ECCENTRICITY: 0.00065733,
    INCLINATION: 51.6329,
    RA_OF_ASC_NODE: 243.6903,
    ARG_OF_PERICENTER: 315.5681,
    MEAN_ANOMALY: 44.478,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
    NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 56224,
    BSTAR: 0.000085733361,
    MEAN_MOTION_DOT: 0.00004242,
    MEAN_MOTION_DDOT: 0
  }
];

describe("IssPassEventSource", () => {
  it("normalizes a CelesTrak ISS OMM response", () => {
    const record = normalizeCelesTrakOmmPayload(issOmmPayload);

    expect(record.OBJECT_NAME).toBe("ISS (ZARYA)");
    expect(record.NORAD_CAT_ID).toBe(25544);
  });

  it("derives visible sunlit ISS passes for a user location", async () => {
    const source = new IssPassEventSource({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => issOmmPayload,
        text: async () => ""
      }),
      sampleSeconds: 20
    });
    const events = await source.generateEvents(
      {
        latitude: 40.7128,
        longitude: -74.006,
        elevationM: 10
      },
      {
        start: new Date("2026-04-18T09:30:00Z"),
        end: new Date("2026-04-18T09:50:00Z")
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "iss_pass",
      title: "ISS visible pass",
      sourceType: "live",
      sourceName: "celestrak-gp-omm",
      peakTime: new Date("2026-04-18T09:40:20Z")
    });
    expect(events[0].localBestViewingAltitudeDeg).toBeGreaterThan(80);
    expect(events[0].localBestViewingSunAltitudeDeg).toBeLessThanOrEqual(-6);
  });
});
