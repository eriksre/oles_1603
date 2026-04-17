import { describe, expect, it } from "vitest";

import {
  AuroraEventSource,
  normalizeOvationAuroraForecast
} from "../../src/engine/aurora-event-source.js";

const ovationPayload = {
  "Observation Time": "2026-04-17T08:12:00Z",
  "Forecast Time": "2026-04-17T09:44:00Z",
  "Data Format": "[Longitude, Latitude, Aurora]",
  coordinates: [
    [177, -62, 16],
    [0, 0, 0]
  ],
  type: "FeatureCollection"
};

describe("AuroraEventSource", () => {
  it("normalizes NOAA SWPC OVATION grid payloads", () => {
    const forecast = normalizeOvationAuroraForecast(ovationPayload);

    expect(forecast.forecastTime.toISOString()).toBe("2026-04-17T09:44:00.000Z");
    expect(forecast.points[0]).toEqual({
      longitude: 177,
      latitude: -62,
      aurora: 16
    });
  });

  it("emits a local aurora opportunity from a matching NOAA grid point", async () => {
    const source = new AuroraEventSource({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ovationPayload,
        text: async () => ""
      })
    });
    const events = await source.generateEvents(
      {
        latitude: -62,
        longitude: 177
      },
      {
        start: new Date("2026-04-17T00:00:00Z"),
        end: new Date("2026-04-17T23:59:59Z")
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "aurora",
      sourceType: "live",
      sourceName: "noaa-swpc-ovation",
      targetAltitudeDeg: 90,
      localBestViewingTime: new Date("2026-04-17T09:44:00Z")
    });
    expect(events[0].localBestViewingSunAltitudeDeg).toBeLessThanOrEqual(-6);
  });
});
