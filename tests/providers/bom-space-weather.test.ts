import { describe, expect, it, vi } from "vitest";

import { BomSpaceWeatherClient } from "../../src/providers/space-weather/bom.js";

describe("BomSpaceWeatherClient", () => {
  it("normalizes aurora alert responses", async () => {
    const client = new BomSpaceWeatherClient({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          data: [
            {
              start_time: "2026-04-23 10:00:00",
              valid_until: "2026-04-23 14:00:00",
              k_aus: 6,
              lat_band: "high",
              description: "Geomagnetic storm in progress."
            }
          ]
        }),
        text: async () => ""
      })
    });

    const notices = await client.getAuroraAlert();

    expect(notices).toEqual([
      expect.objectContaining({
        kind: "alert",
        startTime: new Date("2026-04-23T10:00:00.000Z"),
        validUntil: new Date("2026-04-23T14:00:00.000Z"),
        kAus: 6,
        latBand: "high",
        description: "Geomagnetic storm in progress."
      })
    ]);
  });

  it("queries all BOM aurora notice endpoints concurrently", async () => {
    const seenUrls: string[] = [];
    const client = new BomSpaceWeatherClient({
      apiKey: "test-key",
      fetchImpl: async (input) => {
        seenUrls.push(input);

        if (input.endsWith("get-aurora-alert")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ data: [] }),
            text: async () => ""
          };
        }

        if (input.endsWith("get-aurora-watch")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              data: [
                {
                  issue_time: "2026-04-23 09:00:00",
                  start_date: "2026-04-24",
                  end_date: "2026-04-25",
                  cause: "coronal mass ejection",
                  k_aus: 6,
                  lat_band: "high",
                  comments: "Aurora may be visible."
                }
              ]
            }),
            text: async () => ""
          };
        }

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            data: [
              {
                issue_time: "2026-04-23 09:00:00",
                start_date: "2026-04-26",
                end_date: "2026-04-27",
                cause: "coronal hole",
                comments: "Elevated aurora chance."
              }
            ]
          }),
          text: async () => ""
        };
      }
    });

    const notices = await client.getAuroraNotices();

    expect(seenUrls).toHaveLength(3);
    expect(notices.alert).toHaveLength(0);
    expect(notices.watch).toHaveLength(1);
    expect(notices.outlook).toHaveLength(1);
    expect(notices.outlook[0]).toMatchObject({
      kind: "outlook",
      cause: "coronal hole",
      kAus: undefined,
      latBand: undefined
    });
  });

  it("reuses a cached aurora notice bundle", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.endsWith("get-aurora-alert")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ data: [] }),
          text: async () => ""
        };
      }

      if (input.endsWith("get-aurora-watch")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ data: [] }),
          text: async () => ""
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: [] }),
        text: async () => ""
      };
    });
    const client = new BomSpaceWeatherClient({
      apiKey: "test-key",
      fetchImpl,
      cacheTtlMs: 60_000,
      baseUrl: "https://example.com/bom-cache"
    });

    await client.getAuroraNotices();
    await client.getAuroraNotices();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
