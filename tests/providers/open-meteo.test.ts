import { describe, expect, it } from "vitest";
import {
  OpenMeteoWeatherProvider,
  buildOpenMeteoForecastUrl,
  normalizeOpenMeteoForecast,
} from "../../src/providers/weather/openMeteo.js";

describe("open-meteo weather provider", () => {
  it("builds a forecast url with the expected hourly fields", () => {
    const url = buildOpenMeteoForecastUrl({
      latitude: -33.8688,
      longitude: 151.2093,
      startUtc: "2026-03-27T00:00:00.000Z",
      endUtc: "2026-03-28T00:00:00.000Z",
      timezone: "Australia/Sydney",
    });

    expect(url.toString()).toContain("latitude=-33.8688");
    expect(url.toString()).toContain("longitude=151.2093");
    expect(url.toString()).toContain("start_date=2026-03-27");
    expect(url.toString()).toContain("end_date=2026-03-28");
    expect(url.toString()).toContain("timezone=Australia%2FSydney");
    expect(url.toString()).toContain("cloud_cover_low");
    expect(url.toString()).toContain("wind_speed_10m");
  });

  it("normalizes the open-meteo hourly payload into forecast hours", () => {
    const forecast = normalizeOpenMeteoForecast({
      latitude: -33.9,
      longitude: 151.2,
      timezone: "Australia/Sydney",
      hourly: {
        time: ["2026-03-27T00:00", "2026-03-27T01:00"],
        cloud_cover: [12, 40],
        cloud_cover_low: [5, null],
        cloud_cover_mid: [11, 30],
        cloud_cover_high: [3, 7],
        visibility: [24, 14],
        precipitation_probability: [0, 15],
        wind_speed_10m: [8, 19],
        temperature_2m: [19, 18],
      },
    });

    expect(forecast).toMatchObject({
      provider: "open-meteo",
      latitude: -33.9,
      longitude: 151.2,
      timezone: "Australia/Sydney",
      hours: [
        {
          timeUtc: "2026-03-27T00:00",
          cloudCoverPct: 12,
          cloudCoverLowPct: 5,
          cloudCoverMidPct: 11,
          cloudCoverHighPct: 3,
          visibilityKm: 24,
          precipitationProbabilityPct: 0,
          windSpeedKph: 8,
          temperatureC: 19,
        },
        {
          timeUtc: "2026-03-27T01:00",
          cloudCoverPct: 40,
          cloudCoverLowPct: undefined,
          cloudCoverMidPct: 30,
          cloudCoverHighPct: 7,
          visibilityKm: 14,
          precipitationProbabilityPct: 15,
          windSpeedKph: 19,
          temperatureC: 18,
        },
      ],
    });
  });

  it("calls the fetch implementation and returns normalized data", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {
          latitude: -33.9,
          longitude: 151.2,
          timezone: "Australia/Sydney",
          hourly: {
            time: ["2026-03-27T00:00"],
            cloud_cover: [21],
          },
        };
      },
      async text() {
        return "";
      },
    });

    const provider = new OpenMeteoWeatherProvider({
      fetchImpl,
      baseUrl: "https://example.com/forecast",
      defaultTimezone: "Australia/Sydney",
    });

    const forecast = await provider.getForecast({
      latitude: -33.8688,
      longitude: 151.2093,
      startUtc: "2026-03-27T00:00:00.000Z",
      endUtc: "2026-03-28T00:00:00.000Z",
    });

    expect(forecast.provider).toBe("open-meteo");
    expect(forecast.hours).toHaveLength(1);
    expect(forecast.hours[0]).toMatchObject({
      timeUtc: "2026-03-27T00:00",
      cloudCoverPct: 21,
    });
  });
});
