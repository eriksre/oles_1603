import { describe, expect, it } from "vitest";

import { AuroraEventSource } from "../../src/engine/aurora-event-source.js";

const darkSky = {
  sunAltitudeDeg: -20,
  moonAltitudeDeg: 10,
  moonIllumination: 0.35
};

const daylightSky = {
  sunAltitudeDeg: 8,
  moonAltitudeDeg: -20,
  moonIllumination: 0.2
};

describe("AuroraEventSource", () => {
  it("emits a BOM aurora alert for an observer inside the visible high-latitude region", async () => {
    const source = new AuroraEventSource({
      client: {
        getAuroraNotices: async () => ({
          alert: [
            {
              kind: "alert",
              startTime: new Date("2026-04-23T09:00:00Z"),
              validUntil: new Date("2026-04-23T15:00:00Z"),
              kAus: 6,
              latBand: "high",
              description: "Geomagnetic storm in progress.",
              raw: {}
            }
          ],
          watch: [],
          outlook: []
        })
      },
      skyContextResolver: () => darkSky,
      now: new Date("2026-04-23T10:00:00Z")
    });

    const events = await source.generateEvents(
      {
        latitude: -42.8821,
        longitude: 147.3272,
        locationLabel: "Hobart"
      },
      {
        start: new Date("2026-04-23T00:00:00Z"),
        end: new Date("2026-04-23T23:59:59Z")
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "aurora",
      title: "Aurora alert",
      sourceName: "bom-space-weather",
      targetDirectionLabel: "S",
      azimuthSpanStartDeg: 135,
      azimuthSpanEndDeg: 225
    });
    expect(events[0].description).toContain("Hobart is within BOM's high-latitude aurora visibility region.");
    expect(events[0].localBestViewingSunAltitudeDeg).toBeLessThanOrEqual(-6);
  });

  it("does not emit a high-latitude BOM aurora alert for Sydney", async () => {
    const source = new AuroraEventSource({
      client: {
        getAuroraNotices: async () => ({
          alert: [
            {
              kind: "alert",
              startTime: new Date("2026-04-23T09:00:00Z"),
              validUntil: new Date("2026-04-23T15:00:00Z"),
              kAus: 6,
              latBand: "high",
              description: "Geomagnetic storm in progress.",
              raw: {}
            }
          ],
          watch: [],
          outlook: []
        })
      },
      skyContextResolver: () => darkSky
    });

    const events = await source.generateEvents(
      {
        latitude: -33.8688,
        longitude: 151.2093,
        locationLabel: "Sydney"
      },
      {
        start: new Date("2026-04-23T00:00:00Z"),
        end: new Date("2026-04-23T23:59:59Z")
      }
    );

    expect(events).toHaveLength(0);
  });

  it("keeps the southwest WA visibility exception for K-Aus 6 high-latitude alerts", async () => {
    const source = new AuroraEventSource({
      client: {
        getAuroraNotices: async () => ({
          alert: [
            {
              kind: "alert",
              startTime: new Date("2026-04-23T09:00:00Z"),
              validUntil: new Date("2026-04-23T15:00:00Z"),
              kAus: 6,
              latBand: "high",
              description: "Geomagnetic storm in progress.",
              raw: {}
            }
          ],
          watch: [],
          outlook: []
        })
      },
      skyContextResolver: () => darkSky
    });

    const events = await source.generateEvents(
      {
        latitude: -35.02,
        longitude: 117.88,
        locationLabel: "Albany"
      },
      {
        start: new Date("2026-04-23T00:00:00Z"),
        end: new Date("2026-04-23T23:59:59Z")
      }
    );

    expect(events).toHaveLength(1);
  });

  it("emits a low-latitude BOM aurora outlook for southern Queensland", async () => {
    const source = new AuroraEventSource({
      client: {
        getAuroraNotices: async () => ({
          alert: [],
          watch: [],
          outlook: [
            {
              kind: "outlook",
              issueTime: new Date("2026-04-23T00:00:00Z"),
              startDate: "2026-04-25",
              endDate: "2026-04-26",
              cause: "coronal mass ejection",
              kAus: 8,
              latBand: "low",
              comments: "Auroras may be visible at low latitudes.",
              raw: {}
            }
          ]
        })
      },
      skyContextResolver: () => darkSky
    });

    const events = await source.generateEvents(
      {
        latitude: -28.0167,
        longitude: 153.4,
        locationLabel: "Gold Coast"
      },
      {
        start: new Date("2026-04-25T00:00:00Z"),
        end: new Date("2026-04-26T23:59:59Z")
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Aurora outlook",
      sourceName: "bom-space-weather"
    });
  });

  it("drops BOM notices when no dark-sky viewing window exists inside the notice window", async () => {
    const source = new AuroraEventSource({
      client: {
        getAuroraNotices: async () => ({
          alert: [
            {
              kind: "alert",
              startTime: new Date("2026-04-23T00:00:00Z"),
              validUntil: new Date("2026-04-23T02:00:00Z"),
              kAus: 6,
              latBand: "high",
              description: "Geomagnetic storm in progress.",
              raw: {}
            }
          ],
          watch: [],
          outlook: []
        })
      },
      skyContextResolver: () => daylightSky
    });

    const events = await source.generateEvents(
      {
        latitude: -42.8821,
        longitude: 147.3272
      },
      {
        start: new Date("2026-04-23T00:00:00Z"),
        end: new Date("2026-04-23T23:59:59Z")
      }
    );

    expect(events).toHaveLength(0);
  });
});
