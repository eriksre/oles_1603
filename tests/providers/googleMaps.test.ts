import { describe, expect, it } from "vitest";
import { GoogleMapsPlatformClient } from "../../src/providers/maps/googleMaps.js";

describe("GoogleMapsPlatformClient", () => {
  it("searches for nearby candidate viewing places via the Places API", async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const client = new GoogleMapsPlatformClient({
      apiKey: "test-key",
      searchTerms: ["viewpoint"],
      fetchImpl: async (url, init) => {
        requests.push({ url, body: init?.body });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              places: [
                {
                  id: "place-1",
                  displayName: { text: "Observatory Hill" },
                  location: { latitude: -33.8599, longitude: 151.206 },
                  primaryType: "tourist_attraction",
                  types: ["tourist_attraction", "park"]
                }
              ]
            };
          },
          async text() {
            return "";
          }
        };
      }
    });

    const places = await client.searchNearby({
      latitude: -33.8688,
      longitude: 151.2093,
      radiusMeters: 25_000,
      limit: 5
    });

    expect(requests[0]?.url).toContain("places.googleapis.com");
    expect(requests[0]?.body).toContain("\"textQuery\":\"viewpoint\"");
    expect(places).toEqual([
      {
        id: "place-1",
        name: "Observatory Hill",
        latitude: -33.8599,
        longitude: 151.206,
        source: "google",
        tags: {
          googlePrimaryType: "tourist_attraction",
          googleTypes: "tourist_attraction,park"
        }
      }
    ]);
  });

  it("computes drive time via the Routes API", async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const client = new GoogleMapsPlatformClient({
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        requests.push({ url, body: init?.body });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              routes: [
                {
                  distanceMeters: 8200,
                  duration: "960s"
                }
              ]
            };
          },
          async text() {
            return "";
          }
        };
      }
    });

    const route = await client.estimateRoute({
      origin: { latitude: -33.8688, longitude: 151.2093 },
      destination: { latitude: -33.8599, longitude: 151.206 },
      mode: "driving"
    });

    expect(requests[0]?.url).toContain("routes.googleapis.com");
    expect(requests[0]?.body).toContain("\"travelMode\":\"DRIVING\"");
    expect(route).toEqual({
      distanceMeters: 8200,
      travelTimeMinutes: 16,
      summary: "google-routes"
    });
  });
});
