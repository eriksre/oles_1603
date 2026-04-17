import { describe, expect, it } from "vitest";
import {
  OpenRouterClient,
  resolveOpenRouterConfig
} from "../../src/providers/llm/openRouter.js";

describe("OpenRouterClient", () => {
  it("resolves the model from env with a gpt-5.4-mini default", () => {
    const config = resolveOpenRouterConfig({
      apiKey: "test-key",
      env: {}
    });

    expect(config.model).toBe("openai/gpt-5.4-mini");
    expect(config.apiKey).toBe("test-key");
  });

  it("posts chat completions with the expected OpenRouter headers", async () => {
    const requests: Array<{ url: string; init?: { body?: string; headers?: Record<string, string> } }> = [];
    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "openai/gpt-5.4-mini",
      appUrl: "https://example.com",
      appTitle: "OLES1603",
      fetchImpl: async (url, init) => {
        requests.push({ url, init });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              id: "chatcmpl_1",
              model: "openai/gpt-5.4-mini",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "A concise result"
                  }
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

    const completion = await client.createChatCompletion({
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Return a short answer." }
      ]
    });

    expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "HTTP-Referer": "https://example.com",
      "X-OpenRouter-Title": "OLES1603",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(requests[0]?.init?.body ?? "{}")).toMatchObject({
      model: "openai/gpt-5.4-mini",
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Return a short answer." }
      ]
    });
    expect(completion.choices[0]?.message?.content).toBe("A concise result");
  });

  it("uses OpenRouter to choose between locations and parse JSON output", async () => {
    const client = new OpenRouterClient({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "chatcmpl_2",
            model: "openai/gpt-5.4-mini",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    chosenLocationId: "place-b",
                    chosenLocationName: "Coastal Headland",
                    reason: "Best horizon and still within the drive cap.",
                    confidence: 0.91
                  })
                }
              }
            ]
          };
        },
        async text() {
          return "";
        }
      })
    });

    const decision = await client.chooseBestLocation({
      eventTitle: "Planet parade",
      eventDescription: "Several planets visible low in the western sky.",
      maxDriveMinutes: 20,
      candidates: [
        {
          id: "place-a",
          name: "City Park",
          travelTimeMinutes: 6,
          distanceMeters: 2500
        },
        {
          id: "place-b",
          name: "Coastal Headland",
          travelTimeMinutes: 18,
          distanceMeters: 16500
        }
      ]
    });

    expect(decision).toEqual({
      chosenLocationId: "place-b",
      chosenLocationName: "Coastal Headland",
      reason: "Best horizon and still within the drive cap.",
      confidence: 0.91
    });
  });

  it("generates a short event description", async () => {
    const client = new OpenRouterClient({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "chatcmpl_3",
            model: "openai/gpt-5.4-mini",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "A bright lunar eclipse with a low eastern rise."
                }
              }
            ]
          };
        },
        async text() {
          return "";
        }
      })
    });

    await expect(
      client.generateEventDescription({
        eventTitle: "Total lunar eclipse",
        eventSummary: "The Moon passes through Earth's shadow.",
        locationName: "Observatory Hill",
        directionHint: "ESE",
        viewingNotes: "Low eastern horizon"
      })
    ).resolves.toBe("A bright lunar eclipse with a low eastern rise.");
  });
});
