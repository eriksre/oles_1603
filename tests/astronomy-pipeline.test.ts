import { describe, expect, it, vi } from "vitest";
import { baseEvent, baseObserver, baseWeather } from "./helpers/astronomy-fixtures";
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
    const result = await buildAstronomyRecommendations({
      observer: baseObserver(),
      timeRange: {
        startIso: "2026-03-27T06:30:00.000Z",
        endIso: "2026-03-27T09:00:00.000Z",
      },
      providers: {
        engine,
        weather,
      },
    });

    expect(engine).toHaveBeenCalledTimes(1);
    expect(weather).toHaveBeenCalledTimes(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "event-visible",
      visible: true,
      suppressed: false,
    });
  });

  it("builds sky-facing instructions without candidate viewing places", async () => {
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
      },
    });

    expect(result.events[0]).not.toHaveProperty("recommendedPlaceName");
    expect(result.events[0]?.instructionText).toBe("Look across azimuth 268 to 332 degrees.");
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
