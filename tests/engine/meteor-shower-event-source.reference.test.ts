import { describe, expect, it } from "vitest";
import { MeteorShowerEventSource } from "../../src/engine/meteor-shower-event-source.js";

describe("MeteorShowerEventSource reference events", () => {
  it("matches the American Meteor Society 2023 Perseids maximum", async () => {
    const source = new MeteorShowerEventSource();
    const events = await source.generateEvents(
      {
        latitude: 40.7128,
        longitude: -74.006,
        elevationM: 10
      },
      {
        start: new Date("2023-08-12T00:00:00Z"),
        end: new Date("2023-08-13T23:59:59Z")
      }
    );

    const perseids = events.find((event) => event.id === "perseids-2023");

    expect(perseids).toBeDefined();
    expect(perseids).toMatchObject({
      eventType: "meteor_shower",
      title: "Perseids peak"
    });
    expect(perseids?.peakTime.toISOString()).toBe("2023-08-13T08:00:00.000Z");
    expect(perseids?.targetAltitudeDeg).toBeGreaterThan(0);
    expect(perseids?.targetDirectionLabel).toBeDefined();
    expect(perseids?.localBestViewingTime).toBeDefined();
    expect(perseids?.localBestViewingAltitudeDeg).toBeGreaterThan(45);
    expect(perseids?.localBestViewingSunAltitudeDeg).toBeLessThanOrEqual(-12);
    expect(perseids?.description).toContain("ZHR 100");
  });

  it("does not emit a meteor shower when no dark local radiant window exists", async () => {
    const source = new MeteorShowerEventSource();
    const events = await source.generateEvents(
      {
        latitude: -33.8688,
        longitude: 151.2093,
        elevationM: 58
      },
      {
        start: new Date("2026-08-01T00:00:00Z"),
        end: new Date("2026-09-14T23:59:59Z")
      }
    );

    expect(events.map((event) => event.id)).not.toContain("perseids-2026");
  });
});
