import { describe, expect, it, vi } from "vitest";
import { baseEvent, baseObserver, basePlace, baseWeather } from "./helpers/astronomy-fixtures";
import { loadRequiredModule } from "./helpers/load-required-module";

const pipelineModulePath: string = "../../src/pipeline/recommend-events";

describe("astronomy recommendation pipeline", () => {
  it("filters suppressed events and returns ranked recommendations", async () => {
    const { buildAstronomyRecommendations } = await loadRequiredModule(
      pipelineModulePath,
      "astronomy recommendation pipeline",
    );

    const engine = vi.fn().mockResolvedValue([
      baseEvent({
        id: "event-visible",
        eventType: "lunar_eclipse",
        title: "Total lunar eclipse",
        targetAltitudeDeg: 18,
        confidence: 0.97,
      }),
      baseEvent({
        id: "event-suppressed",
        eventType: "planet_conjunction",
        title: "Mercury in daylight",
        targetAltitudeDeg: 2,
        confidence: 0.78,
      }),
    ]);

    const weather = vi.fn().mockResolvedValue(baseWeather({ cloudCoverPct: 14, lowCloudCoverPct: 10 }));
    const places = vi.fn().mockResolvedValue([
      basePlace({ id: "viewpoint-1", name: "Observatory Hill", travelTimeMinutes: 8, openHorizonScore: 95 }),
      basePlace({ id: "viewpoint-2", name: "Harbour Foreshore", travelTimeMinutes: 14, openHorizonScore: 68 }),
    ]);

    const result = await buildAstronomyRecommendations({
      observer: baseObserver(),
      timeRange: {
        startIso: "2026-03-27T06:30:00.000Z",
        endIso: "2026-03-27T09:00:00.000Z",
      },
      providers: {
        engine,
        weather,
        places,
      },
    });

    expect(engine).toHaveBeenCalledTimes(1);
    expect(weather).toHaveBeenCalledTimes(1);
    expect(places).toHaveBeenCalledTimes(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "event-visible",
      visible: true,
      suppressed: false,
      recommendedPlaceName: "Observatory Hill",
    });
  });

  it("prefers the best place when multiple candidate viewpoints are available", async () => {
    const { buildAstronomyRecommendations } = await loadRequiredModule(
      pipelineModulePath,
      "astronomy recommendation pipeline",
    );

    const result = await buildAstronomyRecommendations({
      observer: baseObserver(),
      timeRange: {
        startIso: "2026-04-05T06:00:00.000Z",
        endIso: "2026-04-05T10:00:00.000Z",
      },
      providers: {
        engine: vi.fn().mockResolvedValue([
          baseEvent({
            id: "event-planet-parade",
            eventType: "planet_parade",
            title: "Planet parade",
            azimuthSpanStartDeg: 268,
            azimuthSpanEndDeg: 332,
            targetAltitudeDeg: 24,
            confidence: 0.88,
          }),
        ]),
        weather: vi.fn().mockResolvedValue(baseWeather({ cloudCoverPct: 6, lowCloudCoverPct: 4 })),
        places: vi.fn().mockResolvedValue([
          basePlace({
            id: "place-a",
            name: "City Park",
            travelTimeMinutes: 3,
            openHorizonScore: 41,
            darkSkyScore: 15,
          }),
          basePlace({
            id: "place-b",
            name: "Coastal Headland",
            travelTimeMinutes: 19,
            openHorizonScore: 93,
            darkSkyScore: 67,
          }),
        ]),
      },
    });

    expect(result.events[0]?.recommendedPlaceName).toBe("Coastal Headland");
    expect(result.events[0]?.instructionText).toContain("Look");
  });

  it("surfaces the contract shape needed by the UI without mixing concerns", async () => {
    const { buildAstronomyRecommendations } = await loadRequiredModule(
      pipelineModulePath,
      "astronomy recommendation pipeline",
    );

    const result = await buildAstronomyRecommendations({
      observer: baseObserver(),
      timeRange: {
        startIso: "2026-03-27T06:30:00.000Z",
        endIso: "2026-03-27T09:00:00.000Z",
      },
      providers: {
        engine: vi.fn().mockResolvedValue([]),
        weather: vi.fn().mockResolvedValue(baseWeather()),
        places: vi.fn().mockResolvedValue([]),
      },
    });

    expect(result).toMatchObject({
      events: [],
      metadata: {
        observerLat: baseObserver().lat,
        observerLon: baseObserver().lon,
      },
    });
  });
});
