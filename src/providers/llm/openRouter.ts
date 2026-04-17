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

export interface LocationCandidate {
  id: string;
  name: string;
  travelTimeMinutes?: number;
  distanceMeters?: number;
  latitude?: number;
  longitude?: number;
  directionLabel?: string;
  opennessScore?: number;
  notes?: string;
}

export interface ChooseBestLocationInput {
  eventTitle: string;
  eventDescription: string;
  maxDriveMinutes: number;
  candidates: LocationCandidate[];
}

export interface ChooseBestLocationResult {
  chosenLocationId: string;
  chosenLocationName: string;
  reason: string;
  confidence: number;
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

const parseJsonPayload = <T>(content: string): T => JSON.parse(stripCodeFences(content)) as T;

const requireString = (value: string | undefined, label: string): string => {
  if (!value) {
    throw new Error(`${label} is required for OpenRouter requests.`);
  }

  return value;
};

const sortCandidates = (candidates: LocationCandidate[]): LocationCandidate[] =>
  [...candidates].sort(
    (left, right) =>
      (left.travelTimeMinutes ?? Number.POSITIVE_INFINITY) -
      (right.travelTimeMinutes ?? Number.POSITIVE_INFINITY)
  );

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
            "You write short, concrete astronomy event descriptions for a consumer app. Keep it factual, vivid, and brief."
        },
        {
          role: "user",
          content: [
            `Event: ${input.eventTitle}`,
            `Summary: ${input.eventSummary}`,
            `Location: ${input.locationName}`,
            input.directionHint ? `Direction: ${input.directionHint}` : undefined,
            input.viewingNotes ? `Notes: ${input.viewingNotes}` : undefined,
            "Write one concise description the user can read quickly."
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n")
        }
      ]
    });

    return requireString(completion.choices[0]?.message?.content ?? undefined, "OpenRouter description");
  }

  public async chooseBestLocation(
    input: ChooseBestLocationInput
  ): Promise<ChooseBestLocationResult> {
    if (input.candidates.length === 0) {
      throw new Error("At least one candidate location is required.");
    }

    const rankedCandidates = sortCandidates(input.candidates);

    const completion = await this.createChatCompletion({
      temperature: 0.2,
      maxTokens: 220,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You choose the best viewing location for an astronomy event. Return JSON only with chosenLocationId, chosenLocationName, reason, and confidence."
        },
        {
          role: "user",
          content: JSON.stringify({
            eventTitle: input.eventTitle,
            eventDescription: input.eventDescription,
            maxDriveMinutes: input.maxDriveMinutes,
            candidates: rankedCandidates.map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              travelTimeMinutes: candidate.travelTimeMinutes,
              distanceMeters: candidate.distanceMeters,
              directionLabel: candidate.directionLabel,
              opennessScore: candidate.opennessScore,
              notes: candidate.notes
            }))
          })
        }
      ]
    });

    const content = requireString(
      completion.choices[0]?.message?.content ?? undefined,
      "OpenRouter location decision"
    );
    return parseJsonPayload<ChooseBestLocationResult>(content);
  }
}
