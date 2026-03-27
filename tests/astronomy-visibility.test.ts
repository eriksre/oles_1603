import { describe, expect, it } from "vitest";
import { baseEvent, baseObserver } from "./helpers/astronomy-fixtures";
import { loadRequiredModule } from "./helpers/load-required-module";

const visibilityModulePath: string = "../../src/domain/visibility";

describe("astronomy visibility", () => {
  it("suppresses events below the horizon", async () => {
    const { classifyAstronomicalVisibility } = await loadRequiredModule(
      visibilityModulePath,
      "astronomical visibility classification",
    );

    const result = classifyAstronomicalVisibility({
      event: baseEvent({ targetAltitudeDeg: -0.5 }),
      observer: baseObserver(),
    });

    expect(result).toMatchObject({
      visible: false,
      horizonSensitive: false,
      classification: "below_horizon",
    });
    expect(result.reasons).toContain("target altitude is at or below the horizon");
  });

  it("marks low-altitude events as horizon sensitive", async () => {
    const { classifyAstronomicalVisibility } = await loadRequiredModule(
      visibilityModulePath,
      "astronomical visibility classification",
    );

    const result = classifyAstronomicalVisibility({
      event: baseEvent({ eventType: "planet_conjunction", targetAltitudeDeg: 4.2 }),
      observer: baseObserver(),
    });

    expect(result).toMatchObject({
      visible: true,
      horizonSensitive: true,
      classification: "horizon_sensitive",
    });
    expect(result.reasons).toContain("target altitude is low enough to be horizon sensitive");
  });

  it("treats healthy altitude events as visible", async () => {
    const { classifyAstronomicalVisibility } = await loadRequiredModule(
      visibilityModulePath,
      "astronomical visibility classification",
    );

    const result = classifyAstronomicalVisibility({
      event: baseEvent({ targetAltitudeDeg: 31 }),
      observer: baseObserver(),
    });

    expect(result).toMatchObject({
      visible: true,
      horizonSensitive: false,
      classification: "visible",
    });
    expect(result.reasons).toEqual([]);
  });
});
