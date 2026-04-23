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

  it("asks the model to explain unfamiliar event names in plain language", async () => {
    const requests: Array<{ body?: string }> = [];
    const client = new OpenRouterClient({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        requests.push({ body: init?.body });

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return {
              id: "chatcmpl_prompt",
              model: "openai/gpt-5.4-mini",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "A meteor shower appears after dark. Look toward the radiant for the best view."
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

    await client.generateEventDescription({
      eventTitle: "Lyrids peak",
      eventSummary: "The Lyrids are a meteor shower with a radiant near Lyra.",
      locationName: "your area"
    });

    const payload = JSON.parse(requests[0]?.body ?? "{}") as {
      messages?: Array<{ role?: string; content?: string }>;
    };

    expect(payload.messages?.[0]?.role).toBe("system");
    expect(payload.messages?.[0]?.content).toContain(
      "Assume the reader may not know the event name"
    );
    expect(payload.messages?.[1]?.content).toContain(
      "Start by naming what kind of event this is in plain language if the title is obscure"
    );
  });

  it("generates a normalized two-sentence event description", async () => {
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
                  content:
                    "A bright lunar eclipse rises into the eastern sky. Totality makes the Moon glow a deep copper above the harbour."
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
        locationName: "your area",
        directionHint: "ESE",
        viewingNotes: "Low eastern horizon"
      })
    ).resolves.toBe(
      "A bright lunar eclipse rises into the eastern sky. Totality makes the Moon glow a deep copper above the harbour."
    );
  });

  it("pads a one-sentence model response into a two-sentence event description", async () => {
    const client = new OpenRouterClient({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "chatcmpl_4",
            model: "openai/gpt-5.4-mini",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Mars, Saturn, and Mercury line up low in the evening sky"
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
        eventTitle: "Planet parade",
        eventSummary: "Mars, Saturn, and Mercury are visible together.",
        locationName: "your area",
        directionHint: "ENE"
      })
    ).resolves.toBe(
      "Mars, Saturn, and Mercury line up low in the evening sky. Look toward ENE for the best view."
    );
  });

  it("removes specific location references from the model description before returning it", async () => {
    const client = new OpenRouterClient({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return {
            id: "chatcmpl_5",
            model: "openai/gpt-5.4-mini",
            choices: [
              {
                message: {
                  role: "assistant",
                  content:
                    "Look ENE, about 18° above the horizon, to spot Mars, Saturn, and Mercury together over Sydney."
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
        eventTitle: "Planet parade",
        eventSummary: "Mars, Saturn, and Mercury are visible together.",
        locationName: "Sydney",
        directionHint: "ENE"
      })
    ).resolves.toBe(
      "Look ENE, about 18° above the horizon, to spot Mars, Saturn, and Mercury together. Look toward ENE for the best view."
    );
  });
});
