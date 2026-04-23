import { describe, expect, it, vi } from "vitest";
import { EventsApi } from "../../src/api/events-api.js";

const event = {
  id: "event-1",
  eventType: "lunar_eclipse" as const,
  title: "Total lunar eclipse",
  description: "A visible eclipse.",
  startTime: new Date("2026-03-28T08:00:00Z"),
  peakTime: new Date("2026-03-28T08:30:00Z"),
  endTime: new Date("2026-03-28T09:00:00Z"),
  sourceType: "derived" as const,
  sourceName: "astronomy-engine",
  confidence: 0.98,
  targetAzimuthDeg: 110,
  targetAltitudeDeg: 18,
  targetDirectionLabel: "ESE",
  sunAltitudeDeg: -14
};

describe("EventsApi", () => {
  it("composes event generation and weather for the observer location", async () => {
    const eventSource = {
      generateEvents: vi.fn().mockResolvedValue([event])
    };
    const weatherProvider = {
      name: "open-meteo",
      getForecast: vi.fn().mockResolvedValue({
        provider: "open-meteo",
        latitude: -33.8688,
        longitude: 151.2093,
        timezone: "Australia/Sydney",
        hours: [
          {
            timeUtc: "2026-03-28T08:00:00Z",
            cloudCoverPct: 12,
            cloudCoverLowPct: 8,
            cloudCoverMidPct: 15,
            cloudCoverHighPct: 20,
            visibilityKm: 22,
            windSpeedKph: 9,
            precipitationProbabilityPct: 5,
            temperatureC: 17
          }
        ]
      })
    };

    const api = new EventsApi({
      eventSource,
      weatherProvider
    });

    const recommendations = await api.getRecommendations({
      observer: {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      timeRange: {
        start: new Date("2026-03-28T06:00:00Z"),
        end: new Date("2026-03-28T10:00:00Z")
      }
    });

    expect(eventSource.generateEvents).toHaveBeenCalledTimes(1);
    expect(eventSource.generateEvents).toHaveBeenCalledWith(
      {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      {
        start: new Date("2026-03-28T06:00:00Z"),
        end: new Date("2026-03-28T10:00:00Z")
      }
    );
    expect(weatherProvider.getForecast).toHaveBeenCalledTimes(1);
    expect(weatherProvider.getForecast).toHaveBeenCalledWith({
      latitude: -33.8688,
      longitude: 151.2093,
      elevationMeters: 58,
      startUtc: "2026-03-28T06:00:00.000Z",
      endUtc: "2026-03-28T10:00:00.000Z"
    });
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      id: "event-1",
      cloudCoverPct: 12,
      lowCloudCoverPct: 8,
      cloudCoverMidPct: 15,
      cloudCoverHighPct: 20,
      precipitationProbabilityPct: 5,
      temperatureC: 17,
      weatherForecastProvider: "open-meteo",
      weatherForecastTimeUtc: "2026-03-28T08:00:00Z",
      weatherForecastDeltaMinutes: 30
    });
    expect(recommendations[0]).not.toHaveProperty("recommendedPlaceName");
    expect(recommendations[0]).not.toHaveProperty("travelTimeMinutes");
  });

  it("uses the astronomy advisor only for event copy", async () => {
    const describeEvent = vi.fn().mockResolvedValue({
      shortDescription: "A bright lunar eclipse rises into the eastern sky.",
      whyItMatters: "High visual impact.",
      viewingAdvice: "Look ESE."
    });
    const api = new EventsApi({
      eventSource: {
        generateEvents: vi.fn().mockResolvedValue([event])
      },
      astronomyAdvisor: {
        describeEvent
      }
    });

    const recommendations = await api.getRecommendations({
      observer: {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      timeRange: {
        start: new Date("2026-03-28T06:00:00Z"),
        end: new Date("2026-03-28T10:00:00Z")
      }
    });

    expect(describeEvent).toHaveBeenCalledTimes(1);
    expect(describeEvent).toHaveBeenCalledWith({
      observer: {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      event: expect.objectContaining({
        id: "event-1",
        title: "Total lunar eclipse"
      })
    });
    expect(recommendations[0]).toMatchObject({
      displayDescription: "A bright lunar eclipse rises into the eastern sky."
    });
    expect(recommendations[0]).not.toHaveProperty("locationSelectionReason");
  });

  it("keeps ISS copy deterministic instead of routing it through the advisor", async () => {
    const describeEvent = vi.fn();
    const api = new EventsApi({
      eventSource: {
        generateEvents: vi.fn().mockResolvedValue([
          {
            ...event,
            id: "iss-1",
            eventType: "iss_pass" as const,
            title: "ISS visible pass",
            startTime: new Date("2026-04-29T08:05:00Z"),
            peakTime: new Date("2026-04-29T08:08:00Z"),
            endTime: new Date("2026-04-29T08:10:00Z"),
            description:
              "Look toward SSW shortly after the pass begins and watch for the ISS for about 3 minutes. It reaches its highest point about 24 degrees above the horizon right before fading from view toward SE."
          }
        ])
      },
      astronomyAdvisor: {
        describeEvent
      }
    });

    const recommendations = await api.getRecommendations({
      observer: {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      timeRange: {
        start: new Date("2026-04-29T08:00:00Z"),
        end: new Date("2026-04-29T09:00:00Z")
      }
    });

    expect(describeEvent).not.toHaveBeenCalled();
    expect(recommendations[0]).toMatchObject({
      id: "iss-1",
      displayDescription:
        "Look toward SSW shortly after the pass begins and watch for the ISS for about 3 minutes. It reaches its highest point about 24 degrees above the horizon right before fading from view toward SE."
    });
  });
});
