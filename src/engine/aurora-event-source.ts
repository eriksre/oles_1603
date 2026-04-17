import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";
import { azimuthToDirectionLabel, normalizeDegrees } from "../utils/direction.js";
import { getLocalSkyContext } from "../utils/observer-sky.js";

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

export interface OvationAuroraPoint {
  longitude: number;
  latitude: number;
  aurora: number;
}

export interface NormalizedOvationAuroraForecast {
  observationTime: Date;
  forecastTime: Date;
  points: OvationAuroraPoint[];
}

export interface AuroraEventSourceOptions {
  fetchImpl?: FetchLike;
  forecastUrl?: string;
  localAuroraThreshold?: number;
  nearbyAuroraThreshold?: number;
  nearbyRadiusKm?: number;
  auroraHeightKm?: number;
}

interface OvationAuroraPayload {
  "Observation Time"?: unknown;
  "Forecast Time"?: unknown;
  coordinates?: unknown;
}

interface ScoredAuroraPoint extends OvationAuroraPoint {
  distanceKm: number;
  bearingDeg: number;
  apparentAltitudeDeg: number;
}

const DEFAULT_FORECAST_URL =
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const EARTH_RADIUS_KM = 6371;
const MINUTE_MS = 60 * 1000;

function toDate(value: unknown, fieldName: string): Date {
  if (typeof value !== "string") {
    throw new Error(`NOAA OVATION payload is missing ${fieldName}.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`NOAA OVATION ${fieldName} is not a valid timestamp.`);
  }

  return date;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeOvationAuroraForecast(
  payload: OvationAuroraPayload
): NormalizedOvationAuroraForecast {
  if (!Array.isArray(payload.coordinates)) {
    throw new Error("NOAA OVATION payload is missing coordinates.");
  }

  const points = payload.coordinates.flatMap((row): OvationAuroraPoint[] => {
    if (!Array.isArray(row) || row.length < 3) {
      return [];
    }

    const longitude = toFiniteNumber(row[0]);
    const latitude = toFiniteNumber(row[1]);
    const aurora = toFiniteNumber(row[2]);

    if (
      longitude === undefined ||
      latitude === undefined ||
      aurora === undefined ||
      latitude < -90 ||
      latitude > 90
    ) {
      return [];
    }

    return [
      {
        longitude: normalizeLongitude(longitude),
        latitude,
        aurora
      }
    ];
  });

  return {
    observationTime: toDate(payload["Observation Time"], "Observation Time"),
    forecastTime: toDate(payload["Forecast Time"], "Forecast Time"),
    points
  };
}

function normalizeLongitude(longitude: number): number {
  const normalized = normalizeDegrees(longitude);
  return normalized > 180 ? normalized - 360 : normalized;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function distanceKm(
  left: Pick<OvationAuroraPoint, "latitude" | "longitude">,
  right: Pick<OvationAuroraPoint, "latitude" | "longitude">
): number {
  const leftLat = toRadians(left.latitude);
  const rightLat = toRadians(right.latitude);
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) *
      Math.cos(rightLat) *
      Math.sin(deltaLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(
  from: Pick<OvationAuroraPoint, "latitude" | "longitude">,
  to: Pick<OvationAuroraPoint, "latitude" | "longitude">
): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);

  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function apparentAuroraAltitudeDeg(distanceKmValue: number, auroraHeightKm: number): number {
  if (distanceKmValue <= 1) {
    return 90;
  }

  const centralAngle = distanceKmValue / EARTH_RADIUS_KM;
  const numerator =
    (EARTH_RADIUS_KM + auroraHeightKm) * Math.cos(centralAngle) -
    EARTH_RADIUS_KM;
  const denominator =
    (EARTH_RADIUS_KM + auroraHeightKm) * Math.sin(centralAngle);

  return toDegrees(Math.atan2(numerator, denominator));
}

function inRange(time: Date, range: TimeRange): boolean {
  return time.getTime() >= range.start.getTime() && time.getTime() <= range.end.getTime();
}

function scorePointForObserver(
  point: OvationAuroraPoint,
  observer: ObserverContext,
  auroraHeightKm: number
): ScoredAuroraPoint {
  const observerPoint = {
    latitude: observer.latitude,
    longitude: observer.longitude
  };
  const pointDistanceKm = distanceKm(observerPoint, point);

  return {
    ...point,
    distanceKm: pointDistanceKm,
    bearingDeg: bearingDeg(observerPoint, point),
    apparentAltitudeDeg: apparentAuroraAltitudeDeg(pointDistanceKm, auroraHeightKm)
  };
}

function selectAuroraPoint(
  forecast: NormalizedOvationAuroraForecast,
  observer: ObserverContext,
  options: Required<Pick<
    AuroraEventSourceOptions,
    "localAuroraThreshold" | "nearbyAuroraThreshold" | "nearbyRadiusKm" | "auroraHeightKm"
  >>
): ScoredAuroraPoint | undefined {
  const scored = forecast.points.map((point) =>
    scorePointForObserver(point, observer, options.auroraHeightKm)
  );
  const local = [...scored].sort(
    (left, right) => left.distanceKm - right.distanceKm
  )[0];
  const nearby = scored
    .filter((point) => point.distanceKm <= options.nearbyRadiusKm)
    .sort(
      (left, right) =>
        right.aurora - left.aurora ||
        left.distanceKm - right.distanceKm
    )[0];

  if (local && local.distanceKm <= 160 && local.aurora >= options.localAuroraThreshold) {
    return local;
  }

  if (
    nearby &&
    nearby.aurora >= options.nearbyAuroraThreshold &&
    nearby.apparentAltitudeDeg > 0
  ) {
    return nearby;
  }

  return undefined;
}

export class AuroraEventSource implements AstronomyEventSource {
  private readonly fetchImpl: FetchLike;
  private readonly forecastUrl: string;
  private readonly localAuroraThreshold: number;
  private readonly nearbyAuroraThreshold: number;
  private readonly nearbyRadiusKm: number;
  private readonly auroraHeightKm: number;

  public constructor(options: AuroraEventSourceOptions = {}) {
    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
    this.forecastUrl = options.forecastUrl ?? DEFAULT_FORECAST_URL;
    this.localAuroraThreshold = options.localAuroraThreshold ?? 10;
    this.nearbyAuroraThreshold = options.nearbyAuroraThreshold ?? 20;
    this.nearbyRadiusKm = options.nearbyRadiusKm ?? 1000;
    this.auroraHeightKm = options.auroraHeightKm ?? 110;
  }

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const response = await this.fetchImpl(this.forecastUrl, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `NOAA OVATION request failed with ${response.status} ${response.statusText}: ${body}`
      );
    }

    const forecast = normalizeOvationAuroraForecast(
      (await response.json()) as OvationAuroraPayload
    );

    if (!inRange(forecast.forecastTime, timeRange)) {
      return [];
    }

    const sky = getLocalSkyContext(forecast.forecastTime, observer);

    if (sky.sunAltitudeDeg > -6) {
      return [];
    }

    const selectedPoint = selectAuroraPoint(forecast, observer, {
      localAuroraThreshold: this.localAuroraThreshold,
      nearbyAuroraThreshold: this.nearbyAuroraThreshold,
      nearbyRadiusKm: this.nearbyRadiusKm,
      auroraHeightKm: this.auroraHeightKm
    });

    if (!selectedPoint) {
      return [];
    }

    const directionLabel = azimuthToDirectionLabel(selectedPoint.bearingDeg);
    const forecastIso = forecast.forecastTime.toISOString();

    return [
      {
        id: `aurora-${forecastIso.replace(/[-:.]/g, "")}-${Math.round(
          observer.latitude * 100
        )}-${Math.round(observer.longitude * 100)}`,
        eventType: "aurora",
        title: "Aurora opportunity",
        description: `NOAA SWPC OVATION forecasts aurora value ${Math.round(
          selectedPoint.aurora
        )} ${Math.round(selectedPoint.distanceKm)} km away toward ${directionLabel}.`,
        startTime: new Date(forecast.forecastTime.getTime() - 30 * MINUTE_MS),
        peakTime: forecast.forecastTime,
        endTime: new Date(forecast.forecastTime.getTime() + 90 * MINUTE_MS),
        sourceType: "live",
        sourceName: "noaa-swpc-ovation",
        confidence: Math.max(0.55, Math.min(0.95, selectedPoint.aurora / 100 + 0.45)),
        targetAzimuthDeg: selectedPoint.bearingDeg,
        targetAltitudeDeg: selectedPoint.apparentAltitudeDeg,
        targetDirectionLabel: directionLabel,
        localBestViewingTime: forecast.forecastTime,
        localBestViewingAzimuthDeg: selectedPoint.bearingDeg,
        localBestViewingAltitudeDeg: selectedPoint.apparentAltitudeDeg,
        localBestViewingDirectionLabel: directionLabel,
        sunAltitudeDeg: sky.sunAltitudeDeg,
        moonAltitudeDeg: sky.moonAltitudeDeg,
        moonIllumination: sky.moonIllumination,
        localBestViewingSunAltitudeDeg: sky.sunAltitudeDeg,
        localBestViewingMoonAltitudeDeg: sky.moonAltitudeDeg,
        localBestViewingMoonIllumination: sky.moonIllumination,
        instructionText: `At ${forecastIso}, look ${directionLabel}; the aurora may sit about ${Math.max(
          1,
          Math.round(selectedPoint.apparentAltitudeDeg)
        )} degrees above the horizon.`
      }
    ];
  }
}
