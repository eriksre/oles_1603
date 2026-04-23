interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
  }
) => Promise<FetchLikeResponse>;

export interface BomResponseError {
  code?: number;
  message?: string;
}

interface BomEnvelope<T> {
  data?: T[];
  errors?: BomResponseError[];
}

interface BomAuroraAlertPayload {
  start_time?: unknown;
  valid_until?: unknown;
  k_aus?: unknown;
  lat_band?: unknown;
  description?: unknown;
}

interface BomAuroraWatchPayload {
  issue_time?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  cause?: unknown;
  k_aus?: unknown;
  lat_band?: unknown;
  comments?: unknown;
}

interface BomAuroraOutlookPayload {
  issue_time?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  cause?: unknown;
  k_aus?: unknown;
  lat_band?: unknown;
  comments?: unknown;
}

export interface BomAuroraAlert {
  kind: "alert";
  startTime: Date;
  validUntil: Date;
  kAus: number;
  latBand: string;
  description: string;
  raw: BomAuroraAlertPayload;
}

export interface BomAuroraWatch {
  kind: "watch";
  issueTime: Date;
  startDate: string;
  endDate: string;
  cause: string;
  kAus: number;
  latBand: string;
  comments: string;
  raw: BomAuroraWatchPayload;
}

export interface BomAuroraOutlook {
  kind: "outlook";
  issueTime: Date;
  startDate: string;
  endDate: string;
  cause: string;
  kAus?: number;
  latBand?: string;
  comments: string;
  raw: BomAuroraOutlookPayload;
}

export interface BomAuroraNoticeBundle {
  alert: BomAuroraAlert[];
  watch: BomAuroraWatch[];
  outlook: BomAuroraOutlook[];
}

export interface BomSpaceWeatherClientEnv {
  BOM_API_KEY?: string;
}

export interface BomSpaceWeatherClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  env?: BomSpaceWeatherClientEnv;
  cacheTtlMs?: number;
}

const DEFAULT_BASE_URL = "https://sws-data.sws.bom.gov.au/api/v1";
const DEFAULT_NOTICE_CACHE_TTL_MS = 15 * 60 * 1000;
const auroraNoticeCache = new Map<
  string,
  { expiresAt: number; value: Promise<BomAuroraNoticeBundle> }
>();

const envFromGlobal = (): BomSpaceWeatherClientEnv => {
  const candidate = globalThis as typeof globalThis & {
    process?: { env?: BomSpaceWeatherClientEnv };
  };

  return candidate.process?.env ?? {};
};

const requireString = (value: string | undefined, label: string): string => {
  if (!value) {
    throw new Error(`${label} is required for BOM space weather requests.`);
  }

  return value;
};

const asNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`BOM payload is missing ${fieldName}.`);
  }

  return value.trim();
};

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asFiniteNumber = (value: unknown, fieldName: string): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`BOM payload is missing ${fieldName}.`);
  }

  return parsed;
};

const parseBomUtcDateTime = (value: unknown, fieldName: string): Date => {
  const raw = asNonEmptyString(value, fieldName);
  const date = new Date(raw.replace(" ", "T").replace(/Z?$/, "Z"));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`BOM ${fieldName} is not a valid UTC timestamp.`);
  }

  return date;
};

const parseBomUtcDate = (value: unknown, fieldName: string): string => {
  const raw = asNonEmptyString(value, fieldName);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`BOM ${fieldName} is not a valid UTC date.`);
  }

  return raw;
};

const normalizeAuroraAlert = (
  payload: BomAuroraAlertPayload
): BomAuroraAlert => ({
  kind: "alert",
  startTime: parseBomUtcDateTime(payload.start_time, "start_time"),
  validUntil: parseBomUtcDateTime(payload.valid_until, "valid_until"),
  kAus: asFiniteNumber(payload.k_aus, "k_aus"),
  latBand: asNonEmptyString(payload.lat_band, "lat_band"),
  description: asNonEmptyString(payload.description, "description"),
  raw: payload
});

const normalizeAuroraWatch = (
  payload: BomAuroraWatchPayload
): BomAuroraWatch => ({
  kind: "watch",
  issueTime: parseBomUtcDateTime(payload.issue_time, "issue_time"),
  startDate: parseBomUtcDate(payload.start_date, "start_date"),
  endDate: parseBomUtcDate(payload.end_date, "end_date"),
  cause: asNonEmptyString(payload.cause, "cause"),
  kAus: asFiniteNumber(payload.k_aus, "k_aus"),
  latBand: asNonEmptyString(payload.lat_band, "lat_band"),
  comments: asNonEmptyString(payload.comments, "comments"),
  raw: payload
});

const normalizeAuroraOutlook = (
  payload: BomAuroraOutlookPayload
): BomAuroraOutlook => ({
  kind: "outlook",
  issueTime: parseBomUtcDateTime(payload.issue_time, "issue_time"),
  startDate: parseBomUtcDate(payload.start_date, "start_date"),
  endDate: parseBomUtcDate(payload.end_date, "end_date"),
  cause: asNonEmptyString(payload.cause, "cause"),
  kAus: payload.k_aus === undefined ? undefined : asFiniteNumber(payload.k_aus, "k_aus"),
  latBand: asOptionalString(payload.lat_band),
  comments: asNonEmptyString(payload.comments, "comments"),
  raw: payload
});

const formatBomErrors = (errors: BomResponseError[] | undefined): string | undefined => {
  if (!errors?.length) {
    return undefined;
  }

  return errors
    .map((error) => {
      const code = error.code === undefined ? "" : `[${error.code}] `;
      return `${code}${error.message ?? "Unknown BOM API error"}`;
    })
    .join("; ");
};

export class BomSpaceWeatherClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly cacheTtlMs: number;

  public constructor(options: BomSpaceWeatherClientOptions = {}) {
    const env = options.env ?? envFromGlobal();
    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;

    this.apiKey = requireString(options.apiKey ?? env.BOM_API_KEY, "BOM_API_KEY");
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_NOTICE_CACHE_TTL_MS;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
  }

  public async getAuroraAlert(): Promise<BomAuroraAlert[]> {
    return this.request("get-aurora-alert", normalizeAuroraAlert);
  }

  public async getAuroraWatch(): Promise<BomAuroraWatch[]> {
    return this.request("get-aurora-watch", normalizeAuroraWatch);
  }

  public async getAuroraOutlook(): Promise<BomAuroraOutlook[]> {
    return this.request("get-aurora-outlook", normalizeAuroraOutlook);
  }

  public async getAuroraNotices(): Promise<BomAuroraNoticeBundle> {
    const nowMs = Date.now();
    for (const [key, entry] of auroraNoticeCache.entries()) {
      if (entry.expiresAt <= nowMs) {
        auroraNoticeCache.delete(key);
      }
    }

    const cacheKey = `${this.baseUrl}:${this.apiKey}`;
    const cached = auroraNoticeCache.get(cacheKey);

    if (cached) {
      return cached.value;
    }

    const request = Promise.all([
      this.getAuroraAlert(),
      this.getAuroraWatch(),
      this.getAuroraOutlook()
    ])
      .then(([alert, watch, outlook]) => ({
        alert,
        watch,
        outlook
      }))
      .catch((error) => {
        auroraNoticeCache.delete(cacheKey);
        throw error;
      });

    auroraNoticeCache.set(cacheKey, {
      expiresAt: nowMs + this.cacheTtlMs,
      value: request
    });

    return request;
  }

  private async request<TPayload extends object, TResult>(
    endpoint: string,
    normalize: (payload: TPayload) => TResult
  ): Promise<TResult[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        api_key: this.apiKey
      })
    });

    const body = (await response.json()) as BomEnvelope<TPayload>;
    const formattedErrors = formatBomErrors(body.errors);

    if (!response.ok) {
      throw new Error(
        `BOM ${endpoint} request failed with ${response.status} ${response.statusText}${formattedErrors ? `: ${formattedErrors}` : ""}`
      );
    }

    if (formattedErrors) {
      throw new Error(`BOM ${endpoint} request returned errors: ${formattedErrors}`);
    }

    if (!Array.isArray(body.data)) {
      throw new Error(`BOM ${endpoint} response is missing data.`);
    }

    return body.data.map((item) => normalize(item));
  }
}
