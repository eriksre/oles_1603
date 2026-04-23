import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  jday,
  json2satrec,
  propagate,
  radiansToDegrees,
  shadowFraction,
  sunPos
} from "satellite.js";
import type { OMMJsonObject, SatRec } from "satellite.js";

import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";
import { azimuthToDirectionLabel, normalizeDegrees } from "../utils/direction.js";
import { getLocalSkyContext } from "../utils/observer-sky.js";
import {
  MINUTE_MS,
  ceilDateToInterval,
  floorDateToInterval,
  pruneExpiredEntries
} from "../utils/stability.js";

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

export type CelesTrakOmmRecord = OMMJsonObject;

export interface IssPassEventSourceOptions {
  fetchImpl?: FetchLike;
  ommUrl?: string;
  sampleSeconds?: number;
  minElevationDeg?: number;
  minPeakElevationDeg?: number;
  minDurationSeconds?: number;
  maxPropagationDaysFromEpoch?: number;
  lookbackMinutes?: number;
  elementsCacheTtlMs?: number;
}

interface IssSample {
  time: Date;
  azimuthDeg: number;
  altitudeDeg: number;
  rangeKm: number;
  sunAltitudeDeg: number;
  moonAltitudeDeg: number;
  moonIllumination: number;
}

interface ActivePass {
  samples: IssSample[];
}

interface LoadedIssElements {
  satrec: SatRec;
  objectName: string;
  epoch: Date;
}

const DEFAULT_ISS_OMM_URL =
  "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON";
const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const issElementsCache = new Map<
  string,
  { expiresAt: number; value: Promise<LoadedIssElements> }
>();

function parseEpoch(epoch: string | undefined): Date {
  if (!epoch) {
    throw new Error("CelesTrak ISS OMM record is missing EPOCH.");
  }

  const date = new Date(epoch.endsWith("Z") ? epoch : `${epoch}Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("CelesTrak ISS OMM record has an invalid EPOCH.");
  }

  return date;
}

export function normalizeCelesTrakOmmPayload(payload: unknown): CelesTrakOmmRecord {
  if (!Array.isArray(payload) || payload.length === 0 || typeof payload[0] !== "object") {
    throw new Error("CelesTrak ISS OMM response did not contain an OMM record.");
  }

  return payload[0] as CelesTrakOmmRecord;
}

function toObserverGeodetic(observer: ObserverContext) {
  return {
    longitude: degreesToRadians(observer.longitude),
    latitude: degreesToRadians(observer.latitude),
    height: (observer.elevationM ?? 0) / 1000
  };
}

function getVisibleSample(
  satrec: SatRec,
  time: Date,
  observer: ObserverContext,
  minElevationDeg: number
): IssSample | undefined {
  const positionAndVelocity = propagate(satrec, time);

  if (!positionAndVelocity || !positionAndVelocity.position) {
    return undefined;
  }

  const gmst = gstime(time);
  const positionEcf = eciToEcf(positionAndVelocity.position, gmst);
  const lookAngles = ecfToLookAngles(toObserverGeodetic(observer), positionEcf);
  const altitudeDeg = radiansToDegrees(lookAngles.elevation);

  if (altitudeDeg < minElevationDeg) {
    return undefined;
  }

  const sky = getLocalSkyContext(time, observer);

  if (sky.sunAltitudeDeg > -6) {
    return undefined;
  }

  const { rsun } = sunPos(jday(time));
  const shadow = shadowFraction(rsun, positionAndVelocity.position);

  if (shadow > 0.2) {
    return undefined;
  }

  return {
    time,
    azimuthDeg: normalizeDegrees(radiansToDegrees(lookAngles.azimuth)),
    altitudeDeg,
    rangeKm: lookAngles.rangeSat,
    ...sky
  };
}

function choosePeakSample(samples: readonly IssSample[]): IssSample {
  return [...samples].sort(
    (left, right) => right.altitudeDeg - left.altitudeDeg
  )[0];
}

function formatDurationLabel(durationSeconds: number): string {
  const roundedMinutes = Math.max(1, Math.round(durationSeconds / 60));

  return roundedMinutes === 1
    ? "about 1 minute"
    : `about ${roundedMinutes} minutes`;
}

function buildPassDescription(input: {
  durationSeconds: number;
  peakAltitudeDeg: number;
  startDirection: string;
  endDirection: string;
  peakTime: Date;
  endTime: Date;
}): string {
  const peakAltitudeDeg = Math.round(input.peakAltitudeDeg);
  const fadeAfterPeakSeconds =
    (input.endTime.getTime() - input.peakTime.getTime()) / SECOND_MS;
  const fadeClause =
    fadeAfterPeakSeconds <= 45
      ? `It reaches its highest point about ${peakAltitudeDeg} degrees above the horizon right before fading from view toward ${input.endDirection}.`
      : `It reaches its highest point about ${peakAltitudeDeg} degrees above the horizon, then fades toward ${input.endDirection}.`;

  return `Look toward ${input.startDirection} shortly after the pass begins and watch for the ISS for ${formatDurationLabel(
    input.durationSeconds
  )}. ${fadeClause}`;
}

function passToEvent(
  pass: ActivePass,
  objectName: string,
  minPeakElevationDeg: number,
  minDurationSeconds: number
): AstronomyEventCandidate | undefined {
  const start = pass.samples[0];
  const end = pass.samples[pass.samples.length - 1];
  const durationSeconds = (end.time.getTime() - start.time.getTime()) / SECOND_MS;
  const peak = choosePeakSample(pass.samples);

  if (peak.altitudeDeg < minPeakElevationDeg || durationSeconds < minDurationSeconds) {
    return undefined;
  }

  const peakDirection = azimuthToDirectionLabel(peak.azimuthDeg);
  const startDirection = azimuthToDirectionLabel(start.azimuthDeg);
  const endDirection = azimuthToDirectionLabel(end.azimuthDeg);
  const peakIso = peak.time.toISOString();

  return {
    id: `iss-pass-${peakIso.replace(/[-:.]/g, "")}`,
    eventType: "iss_pass",
    title: "ISS visible pass",
    description: buildPassDescription({
      durationSeconds,
      peakAltitudeDeg: peak.altitudeDeg,
      startDirection,
      endDirection,
      peakTime: peak.time,
      endTime: end.time
    }),
    startTime: start.time,
    peakTime: peak.time,
    endTime: end.time,
    sourceType: "live",
    sourceName: "celestrak-gp-omm",
    confidence: 0.82,
    targetAzimuthDeg: peak.azimuthDeg,
    targetAltitudeDeg: peak.altitudeDeg,
    targetDirectionLabel: peakDirection,
    localBestViewingTime: peak.time,
    localBestViewingAzimuthDeg: peak.azimuthDeg,
    localBestViewingAltitudeDeg: peak.altitudeDeg,
    localBestViewingDirectionLabel: peakDirection,
    sunAltitudeDeg: peak.sunAltitudeDeg,
    moonAltitudeDeg: peak.moonAltitudeDeg,
    moonIllumination: peak.moonIllumination,
    localBestViewingSunAltitudeDeg: peak.sunAltitudeDeg,
    localBestViewingMoonAltitudeDeg: peak.moonAltitudeDeg,
    localBestViewingMoonIllumination: peak.moonIllumination,
    instructionText: `From ${start.time.toISOString()} to ${end.time.toISOString()}, watch for the ISS moving from ${startDirection} to ${endDirection}; it peaks toward ${peakDirection}.`
  };
}

export class IssPassEventSource implements AstronomyEventSource {
  private readonly fetchImpl: FetchLike;
  private readonly ommUrl: string;
  private readonly sampleMs: number;
  private readonly minElevationDeg: number;
  private readonly minPeakElevationDeg: number;
  private readonly minDurationSeconds: number;
  private readonly maxPropagationDaysFromEpoch: number;
  private readonly lookbackMs: number;
  private readonly elementsCacheTtlMs: number;

  public constructor(options: IssPassEventSourceOptions = {}) {
    const defaultFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        if (!defaultFetch) {
          throw new Error("Global fetch is unavailable; provide fetchImpl explicitly.");
        }

        return defaultFetch(input, init);
      });
    this.ommUrl = options.ommUrl ?? DEFAULT_ISS_OMM_URL;
    this.sampleMs = (options.sampleSeconds ?? 20) * SECOND_MS;
    this.minElevationDeg = options.minElevationDeg ?? 10;
    this.minPeakElevationDeg = options.minPeakElevationDeg ?? 20;
    this.minDurationSeconds = options.minDurationSeconds ?? 60;
    this.maxPropagationDaysFromEpoch = options.maxPropagationDaysFromEpoch ?? 7;
    this.lookbackMs = (options.lookbackMinutes ?? 5) * MINUTE_MS;
    this.elementsCacheTtlMs = options.elementsCacheTtlMs ?? 15 * MINUTE_MS;
  }

  private async loadIssElements(): Promise<LoadedIssElements> {
    const nowMs = Date.now();
    pruneExpiredEntries(issElementsCache, nowMs);
    const cacheKey = this.ommUrl;
    const cached = issElementsCache.get(cacheKey);

    if (cached) {
      return cached.value;
    }

    const request = this.fetchImpl(this.ommUrl, {
      headers: {
        accept: "application/json"
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `CelesTrak ISS OMM request failed with ${response.status} ${response.statusText}: ${body}`
          );
        }

        const record = normalizeCelesTrakOmmPayload(await response.json());

        return {
          satrec: json2satrec(record),
          objectName: record.OBJECT_NAME ?? "ISS",
          epoch: parseEpoch(record.EPOCH)
        };
      })
      .catch((error) => {
        issElementsCache.delete(cacheKey);
        throw error;
      });

    issElementsCache.set(cacheKey, {
      expiresAt: nowMs + this.elementsCacheTtlMs,
      value: request
    });

    return request;
  }

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const elements = await this.loadIssElements();
    const liveAnchor = observer.liveAnchorTime ?? observer.snapshotTime ?? timeRange.start;
    const propagationStart = new Date(
      elements.epoch.getTime() - this.maxPropagationDaysFromEpoch * DAY_MS
    );
    const propagationEnd = new Date(
      elements.epoch.getTime() + this.maxPropagationDaysFromEpoch * DAY_MS
    );
    const startMs = Math.max(
      floorDateToInterval(liveAnchor, this.sampleMs).getTime() - this.lookbackMs,
      propagationStart.getTime()
    );
    const endMs = Math.min(
      ceilDateToInterval(timeRange.end, this.sampleMs).getTime(),
      propagationEnd.getTime()
    );
    const passes: ActivePass[] = [];
    let activePass: ActivePass | undefined;

    if (endMs < startMs) {
      return [];
    }

    for (let timeMs = startMs; timeMs <= endMs; timeMs += this.sampleMs) {
      const sample = getVisibleSample(
        elements.satrec,
        new Date(timeMs),
        observer,
        this.minElevationDeg
      );

      if (sample) {
        activePass ??= { samples: [] };
        activePass.samples.push(sample);
        continue;
      }

      if (activePass) {
        passes.push(activePass);
        activePass = undefined;
      }
    }

    if (activePass) {
      passes.push(activePass);
    }

    return passes
      .flatMap((pass) => {
        const event = passToEvent(
          pass,
          elements.objectName,
          this.minPeakElevationDeg,
          this.minDurationSeconds
        );

        return event ? [event] : [];
      })
      .filter((event) => event.endTime.getTime() >= liveAnchor.getTime())
      .sort((left, right) => left.peakTime.getTime() - right.peakTime.getTime());
  }
}
