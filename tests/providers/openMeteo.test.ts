import { describe, expect, it, vi } from "vitest";

import {
  buildOpenMeteoForecastUrl,
  normalizeOpenMeteoForecast,
  OpenMeteoWeatherProvider
} from "../../src/providers/weather/openMeteo.js";

describe("OpenMeteoWeatherProvider", () => {
  it("builds a forecast URL with the required query params", () => {
    const url = buildOpenMeteoForecastUrl({
      latitude: -33.8688,
      longitude: 151.2093,
      startUtc: "2026-03-27T00:00:00.000Z",
      endUtc: "2026-03-28T00:00:00.000Z",
      timezone: "Australia/Sydney"
    });

    expect(url.toString()).toContain("latitude=-33.8688");
    expect(url.toString()).toContain("longitude=151.2093");
    expect(url.toString()).toContain("start_date=2026-03-27");
    expect(url.toString()).toContain("end_date=2026-03-28");
    expect(url.toString()).toContain("timezone=Australia%2FSydney");
    expect(url.toString()).toContain("cloud_cover");
  });

  it("normalizes Open-Meteo hourly payloads into provider-agnostic forecast hours", () => {
    const forecast = normalizeOpenMeteoForecast({
      latitude: -33.8688,
      longitude: 151.2093,
      timezone: "Australia/Sydney",
      utc_offset_seconds: 36000,
      hourly: {
        time: ["2026-03-27T00:00", "2026-03-27T01:00"],
        cloud_cover: [10, 20],
        cloud_cover_low: [1, 2],
        cloud_cover_mid: [3, 4],
        cloud_cover_high: [5, 6],
        visibility: [24_000, 20_000],
        precipitation_probability: [0, 10],
        wind_speed_10m: [14, 15],
        temperature_2m: [18, 19]
      }
    });

    expect(forecast.provider).toBe("open-meteo");
    expect(forecast.hours).toHaveLength(2);
    expect(forecast.hours[0]).toMatchObject({
      timeUtc: "2026-03-26T14:00:00.000Z",
      cloudCoverPct: 10,
      cloudCoverLowPct: 1,
      visibilityKm: 24,
      windSpeedKph: 14
    });
  });

  it("fetches and normalizes a forecast", async () => {
    const provider = new OpenMeteoWeatherProvider({
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            latitude: -33.8688,
            longitude: 151.2093,
            timezone: "Australia/Sydney",
            hourly: {
              time: ["2026-03-27T00:00"],
              cloud_cover: [40]
            }
          }),
          text: async () => ""
        }) as const
    });

    const forecast = await provider.getForecast({
      latitude: -33.8688,
      longitude: 151.2093,
      startUtc: "2026-03-27T00:00:00.000Z",
      endUtc: "2026-03-28T00:00:00.000Z",
      timezone: "Australia/Sydney"
    });

    expect(forecast.provider).toBe("open-meteo");
    expect(forecast.hours[0]?.cloudCoverPct).toBe(40);
  });

  it("reuses a cached forecast for identical queries", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        latitude: -33.8688,
        longitude: 151.2093,
        timezone: "Australia/Sydney",
        hourly: {
          time: ["2026-03-27T00:00"],
          cloud_cover: [40]
        }
      }),
      text: async () => ""
    }));
    const provider = new OpenMeteoWeatherProvider({
      fetchImpl,
      cacheTtlMs: 60_000,
      baseUrl: "https://example.com/cache-forecast"
    });
    const query = {
      latitude: -33.8688,
      longitude: 151.2093,
      startUtc: "2026-03-27T00:00:00.000Z",
      endUtc: "2026-03-28T00:00:00.000Z",
      timezone: "Australia/Sydney"
    };

    await provider.getForecast(query);
    await provider.getForecast(query);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
