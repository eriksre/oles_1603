import type { WeatherForecast, WeatherForecastHour, WeatherForecastQuery, WeatherProvider } from "../types.js";

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
    headers?: Record<string, string>;
    signal?: unknown;
  }
) => Promise<FetchLikeResponse>;

export interface OpenMeteoWeatherProviderOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  defaultTimezone?: string;
}

export interface OpenMeteoHourlyPayload {
  time: string[];
  cloud_cover?: Array<number | null>;
  cloud_cover_low?: Array<number | null>;
  cloud_cover_mid?: Array<number | null>;
  cloud_cover_high?: Array<number | null>;
  visibility?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  temperature_2m?: Array<number | null>;
}

export interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  timezone?: string;
  hourly_units?: Record<string, string>;
  hourly?: OpenMeteoHourlyPayload;
}

const DEFAULT_BASE_URL = "https://api.open-meteo.com/v1/forecast";

export function buildOpenMeteoForecastUrl(query: WeatherForecastQuery, baseUrl = DEFAULT_BASE_URL): URL {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(query.latitude));
  url.searchParams.set("longitude", String(query.longitude));
  url.searchParams.set("start_date", query.startUtc.slice(0, 10));
  url.searchParams.set("end_date", query.endUtc.slice(0, 10));
  url.searchParams.set(
    "hourly",
    [
      "cloud_cover",
      "cloud_cover_low",
      "cloud_cover_mid",
      "cloud_cover_high",
      "visibility",
      "precipitation_probability",
      "wind_speed_10m",
      "temperature_2m"
    ].join(",")
  );
  url.searchParams.set("timezone", query.timezone ?? "auto");
  return url;
}

function toNullableNumber(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value;
}

function buildHours(payload: OpenMeteoHourlyPayload): WeatherForecastHour[] {
  return payload.time.map((timeUtc, index) => ({
    timeUtc,
    cloudCoverPct: toNullableNumber(payload.cloud_cover?.[index]),
    cloudCoverLowPct: toNullableNumber(payload.cloud_cover_low?.[index]),
    cloudCoverMidPct: toNullableNumber(payload.cloud_cover_mid?.[index]),
    cloudCoverHighPct: toNullableNumber(payload.cloud_cover_high?.[index]),
    visibilityKm: toNullableNumber(payload.visibility?.[index]),
    precipitationProbabilityPct: toNullableNumber(payload.precipitation_probability?.[index]),
    windSpeedKph: toNullableNumber(payload.wind_speed_10m?.[index]),
    temperatureC: toNullableNumber(payload.temperature_2m?.[index])
  }));
}

export function normalizeOpenMeteoForecast(response: OpenMeteoForecastResponse): WeatherForecast {
  const hourly = response.hourly ?? { time: [] };

  return {
    provider: "open-meteo",
    latitude: response.latitude,
    longitude: response.longitude,
    timezone: response.timezone ?? "auto",
    hours: buildHours(hourly),
    raw: response
  };
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  public readonly name = "open-meteo";

  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly defaultTimezone: string;

  constructor(options: OpenMeteoWeatherProviderOptions = {}) {
    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultTimezone = options.defaultTimezone ?? "auto";
  }

  async getForecast(query: WeatherForecastQuery): Promise<WeatherForecast> {
    const url = buildOpenMeteoForecastUrl(
      {
        ...query,
        timezone: query.timezone ?? this.defaultTimezone
      },
      this.baseUrl
    );

    const response = await this.fetchImpl(url.toString(), {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Open-Meteo request failed with ${response.status} ${response.statusText}: ${body}`);
    }

    const payload = (await response.json()) as OpenMeteoForecastResponse;
    return normalizeOpenMeteoForecast(payload);
  }
}
