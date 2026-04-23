import { describe, expect, it } from "vitest";
import { baseEvent, baseObserver, baseWeather } from "./helpers/astronomy-fixtures";
import { loadRequiredModule } from "./helpers/load-required-module";

const scoringModulePath: string = "../../src/domain/scoring";

describe("astronomy scoring", () => {
  it("gives high-priority eclipse events a stronger base score than ordinary full moons", async () => {
    const { scoreAstronomyEvent } = await loadRequiredModule(
      scoringModulePath,
      "astronomy scoring",
    );

    const eclipse = scoreAstronomyEvent({
      event: baseEvent({
        eventType: "lunar_eclipse",
        title: "Total lunar eclipse",
        confidence: 0.98,
      }),
      observer: baseObserver(),
      weather: baseWeather(),
    });

    const fullMoon = scoreAstronomyEvent({
      event: baseEvent({
        id: "event-2",
        eventType: "full_moon",
        title: "Full moon",
        confidence: 0.9,
      }),
      observer: baseObserver(),
      weather: baseWeather(),
    });

    expect(eclipse.coolScore).toBeGreaterThan(fullMoon.coolScore);
    expect(eclipse.finalScore).toBeGreaterThan(fullMoon.finalScore);
  });

  it("penalizes poor cloud cover more heavily for meteor showers and aurora", async () => {
    const { scoreAstronomyEvent } = await loadRequiredModule(
      scoringModulePath,
      "astronomy scoring",
    );

    const clearMeteor = scoreAstronomyEvent({
      event: baseEvent({
        eventType: "meteor_shower",
        title: "Meteor shower",
        sourceType: "curated",
        confidence: 0.85,
      }),
      observer: baseObserver(),
      weather: baseWeather({ cloudCoverPct: 8, lowCloudCoverPct: 5 }),
    });

    const cloudyMeteor = scoreAstronomyEvent({
      event: baseEvent({
        id: "event-3",
        eventType: "meteor_shower",
        title: "Meteor shower",
        sourceType: "curated",
        confidence: 0.85,
      }),
      observer: baseObserver(),
      weather: baseWeather({ cloudCoverPct: 88, lowCloudCoverPct: 80 }),
    });

    expect(clearMeteor.finalScore).toBeGreaterThan(cloudyMeteor.finalScore);
    expect(cloudyMeteor.suppressionReasons).toContain("cloud cover is too high for a practical meteor shower recommendation");
  });

  it("keeps scores bounded and drops impractical twilight events", async () => {
    const { scoreAstronomyEvent } = await loadRequiredModule(
      scoringModulePath,
      "astronomy scoring",
    );

    const result = scoreAstronomyEvent({
      event: baseEvent({
        eventType: "planet_conjunction",
        title: "Mercury in bright twilight",
        targetAltitudeDeg: 3,
      }),
      observer: baseObserver(),
      weather: baseWeather({ cloudCoverPct: 15, lowCloudCoverPct: 12 }),
      sky: {
        sunAltitudeDeg: -1.5,
        moonAltitudeDeg: 42,
        moonIllumination: 0.63,
      },
    });

    expect(result.coolScore).toBeGreaterThanOrEqual(0);
    expect(result.coolScore).toBeLessThanOrEqual(100);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(result.suppressionReasons).toContain("sun altitude is too bright for a subtle low-altitude event");
  });
});
