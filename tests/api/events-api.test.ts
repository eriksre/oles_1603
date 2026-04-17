import { describe, expect, it, vi } from "vitest";
import { EventsApi } from "../../src/api/events-api.js";

describe("EventsApi", () => {
  it("composes event generation, weather, and maps routing with a 20 minute drive cap", async () => {
    const eventSource = {
      generateEvents: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          eventType: "lunar_eclipse",
          title: "Total lunar eclipse",
          description: "A visible eclipse.",
          startTime: new Date("2026-03-28T08:00:00Z"),
          peakTime: new Date("2026-03-28T08:30:00Z"),
          endTime: new Date("2026-03-28T09:00:00Z"),
          sourceType: "derived",
          sourceName: "astronomy-engine",
          confidence: 0.98,
          targetAzimuthDeg: 110,
          targetAltitudeDeg: 18,
          targetDirectionLabel: "ESE",
          sunAltitudeDeg: -14
        }
      ])
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
            visibilityKm: 22,
            windSpeedKph: 9
          }
        ]
      })
    };
    const placeSearchProvider = {
      name: "google-maps-platform",
      searchNearby: vi.fn().mockResolvedValue([
        {
          id: "place-near",
          name: "Observatory Hill",
          latitude: -33.8599,
          longitude: 151.206,
          source: "google",
          tags: { googlePrimaryType: "park" }
        },
        {
          id: "place-far",
          name: "Distant Headland",
          latitude: -33.7,
          longitude: 151.3,
          source: "google",
          tags: { googlePrimaryType: "beach" }
        }
      ])
    };
    const routingProvider = {
      name: "google-maps-platform",
      estimateRoute: vi
        .fn()
        .mockResolvedValueOnce({
          distanceMeters: 4500,
          travelTimeMinutes: 9
        })
        .mockResolvedValueOnce({
          distanceMeters: 32000,
          travelTimeMinutes: 32
        })
    };

    const api = new EventsApi({
      eventSource,
      weatherProvider,
      placeSearchProvider,
      routingProvider
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
    expect(weatherProvider.getForecast).toHaveBeenCalledTimes(1);
    expect(placeSearchProvider.searchNearby).toHaveBeenCalledTimes(1);
    expect(routingProvider.estimateRoute).toHaveBeenCalledTimes(2);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      id: "event-1",
      recommendedPlaceName: "Observatory Hill",
      travelTimeMinutes: 9
    });
  });

  it("uses the astronomy advisor to override the place choice and add display copy", async () => {
    const api = new EventsApi({
      eventSource: {
        generateEvents: vi.fn().mockResolvedValue([
          {
            id: "event-1",
            eventType: "lunar_eclipse",
            title: "Total lunar eclipse",
            description: "A visible eclipse.",
            startTime: new Date("2026-03-28T08:00:00Z"),
            peakTime: new Date("2026-03-28T08:30:00Z"),
            endTime: new Date("2026-03-28T09:00:00Z"),
            sourceType: "derived",
            sourceName: "astronomy-engine",
            confidence: 0.98,
            targetAzimuthDeg: 110,
            targetAltitudeDeg: 18,
            targetDirectionLabel: "ESE",
            sunAltitudeDeg: -14
          }
        ])
      },
      weatherProvider: {
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
              visibilityKm: 22,
              windSpeedKph: 9
            }
          ]
        })
      },
      placeSearchProvider: {
        name: "google-maps-platform",
        searchNearby: vi.fn().mockResolvedValue([
          {
            id: "place-near",
            name: "Observatory Hill",
            latitude: -33.8599,
            longitude: 151.206,
            source: "google",
            tags: { googlePrimaryType: "park" }
          },
          {
            id: "place-better",
            name: "Harbour Headland",
            latitude: -33.851,
            longitude: 151.24,
            source: "google",
            tags: { googlePrimaryType: "beach" }
          }
        ])
      },
      routingProvider: {
        name: "google-maps-platform",
        estimateRoute: vi
          .fn()
          .mockResolvedValueOnce({
            distanceMeters: 4500,
            travelTimeMinutes: 9
          })
          .mockResolvedValueOnce({
            distanceMeters: 7000,
            travelTimeMinutes: 14
          })
      },
      astronomyAdvisor: {
        chooseLocation: vi.fn().mockResolvedValue({
          selectedPlaceId: "place-better",
          rationale: "Cleaner eastern horizon."
        }),
        describeEvent: vi.fn().mockResolvedValue({
          shortDescription: "A bright lunar eclipse rises over the harbour.",
          whyItMatters: "High visual impact.",
          viewingAdvice: "Look ESE."
        })
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

    expect(recommendations[0]).toMatchObject({
      recommendedPlaceName: "Harbour Headland",
      travelTimeMinutes: 14,
      displayDescription: "A bright lunar eclipse rises over the harbour.",
      locationSelectionReason: "Cleaner eastern horizon."
    });
  });
});
