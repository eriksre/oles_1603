export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<FetchLikeResponse>;

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterChatCompletionRequest {
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: {
    type: "json_object";
  };
}

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OpenRouterChatCompletionResponseChoice {
  message?: {
    role?: string;
    content?: string | null;
  };
  finish_reason?: string;
}

export interface OpenRouterChatCompletionResponse {
  id: string;
  model: string;
  choices: OpenRouterChatCompletionResponseChoice[];
  usage?: OpenRouterUsage;
}

export interface OpenRouterClientEnv {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_APP_URL?: string;
  OPENROUTER_APP_TITLE?: string;
}

export interface OpenRouterClientOptions {
  apiKey?: string;
  model?: string;
  appUrl?: string;
  appTitle?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  env?: OpenRouterClientEnv;
}

export interface OpenRouterResolvedConfig {
  apiKey: string;
  model: string;
  appUrl?: string;
  appTitle?: string;
  baseUrl: string;
}

export interface GenerateEventDescriptionInput {
  eventTitle: string;
  eventSummary: string;
  locationName: string;
  directionHint?: string;
  viewingNotes?: string;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-5.4-mini";

const envFromGlobal = (): OpenRouterClientEnv => {
  const candidate = globalThis as typeof globalThis & {
    process?: { env?: OpenRouterClientEnv };
  };

  return candidate.process?.env ?? {};
};

const stripCodeFences = (value: string): string =>
  value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureTrailingPeriod = (value: string): string =>
  /[.!?]$/.test(value) ? value : `${value}.`;

const splitSentences = (value: string): string[] =>
  collapseWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const requireString = (value: string | undefined, label: string): string => {
  if (!value) {
    throw new Error(`${label} is required for OpenRouter requests.`);
  }

  return value;
};

const buildDescriptionFallbackSentence = (
  input: GenerateEventDescriptionInput
): string => {
  if (input.directionHint) {
    return `Look toward ${input.directionHint} for the best view.`;
  }

  return "Look for a clear, dark patch of sky for the best view.";
};

const stripLocationReferences = (value: string, locationName: string): string => {
  const trimmedLocationName = locationName.trim();

  if (!trimmedLocationName) {
    return collapseWhitespace(value);
  }

  const escapedLocationName = escapeRegExp(trimmedLocationName);

  return collapseWhitespace(
    value
      .replace(
        new RegExp(
          `\\b(?:over|above|from|at|near|around|by|in|across|off|outside)\\s+${escapedLocationName}\\b`,
          "gi"
        ),
        ""
      )
      .replace(new RegExp(`\\b${escapedLocationName}\\b`, "gi"), "")
      .replace(/\s+([,.;!?])/g, "$1")
      .replace(/\(\s*\)/g, "")
  );
};

const normalizeEventDescription = (
  content: string,
  input: GenerateEventDescriptionInput
): string => {
  const sentences = splitSentences(
    stripLocationReferences(stripCodeFences(content), input.locationName)
  );

  if (sentences.length >= 2) {
    return sentences.slice(0, 2).map(ensureTrailingPeriod).join(" ");
  }

  if (sentences.length === 1) {
    return `${ensureTrailingPeriod(sentences[0])} ${buildDescriptionFallbackSentence(input)}`;
  }

  return `${ensureTrailingPeriod(input.eventSummary)} ${buildDescriptionFallbackSentence(input)}`;
};

export const resolveOpenRouterConfig = (
  options: OpenRouterClientOptions = {}
): OpenRouterResolvedConfig => {
  const env = options.env ?? envFromGlobal();

  return {
    apiKey: requireString(options.apiKey ?? env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
    model: options.model ?? env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    appUrl: options.appUrl ?? env.OPENROUTER_APP_URL,
    appTitle: options.appTitle ?? env.OPENROUTER_APP_TITLE,
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL
  };
};

export class OpenRouterClient {
  private readonly fetchImpl: FetchLike;
  private readonly config: OpenRouterResolvedConfig;

  public constructor(options: OpenRouterClientOptions = {}) {
    this.config = resolveOpenRouterConfig(options);

    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
  }

  public get model(): string {
    return this.config.model;
  }

  public async createChatCompletion(
    request: OpenRouterChatCompletionRequest
  ): Promise<OpenRouterChatCompletionResponse> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
        headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.appUrl ? { "HTTP-Referer": this.config.appUrl } : {}),
        ...(this.config.appTitle ? { "X-OpenRouter-Title": this.config.appTitle } : {})
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        response_format: request.responseFormat
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter request failed with ${response.status} ${response.statusText}: ${body}`
      );
    }

    return (await response.json()) as OpenRouterChatCompletionResponse;
  }

  public async generateEventDescription(
    input: GenerateEventDescriptionInput
  ): Promise<string> {
    const completion = await this.createChatCompletion({
      temperature: 0.4,
      maxTokens: 180,
      messages: [
        {
          role: "system",
          content:
            "You write short, concrete astronomy event descriptions for a consumer app. Assume the reader may not know the event name, and explain what the event is in plain language before giving viewing details. Return exactly two sentences, keep it factual and vivid, do not use lists or markdown, and do not mention specific place names, venues, parks, neighborhoods, or addresses."
        },
        {
          role: "user",
          content: [
            `Event: ${input.eventTitle}`,
            `Summary: ${input.eventSummary}`,
            input.directionHint ? `Direction: ${input.directionHint}` : undefined,
            input.viewingNotes ? `Notes: ${input.viewingNotes}` : undefined,
            "Write exactly two sentences the user can read quickly. Start by naming what kind of event this is in plain language if the title is obscure, then describe where to look in the sky with generic directions."
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n")
        }
      ]
    });

    return normalizeEventDescription(
      requireString(completion.choices[0]?.message?.content ?? undefined, "OpenRouter description"),
      input
    );
  }
}
