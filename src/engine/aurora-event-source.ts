import type { AstronomyEventCandidate } from "../domain/events.js";
import type { ObserverContext, TimeRange } from "../domain/observer.js";
import type { AstronomyEventSource } from "./contracts.js";
import {
  BomSpaceWeatherClient,
  type BomAuroraAlert,
  type BomAuroraNoticeBundle,
  type BomAuroraOutlook,
  type BomAuroraWatch
} from "../providers/space-weather/bom.js";
import { getLocalSkyContext } from "../utils/observer-sky.js";

type AuroraLatBand = "high" | "mid" | "low" | "equatorial";
type AuroraNotice = BomAuroraAlert | BomAuroraWatch | BomAuroraOutlook;

interface SkyContext {
  sunAltitudeDeg: number;
  moonAltitudeDeg: number;
  moonIllumination: number;
}

interface NoticeWindow {
  start: Date;
  end: Date;
}

interface BestViewingWindow {
  time: Date;
  sky: SkyContext;
}

interface BomSpaceWeatherNoticeClient {
  getAuroraNotices(): Promise<BomAuroraNoticeBundle>;
}

export interface AuroraEventSourceOptions {
  client?: BomSpaceWeatherNoticeClient;
  skyContextResolver?: (time: Date, observer: ObserverContext) => SkyContext;
  minDarkSkySunAltitudeDeg?: number;
  now?: Date | (() => Date);
}

const HOUR_MS = 60 * 60 * 1000;
const AURORA_AZIMUTH_DEG = 180;
const AURORA_SPAN_START_DEG = 135;
const AURORA_SPAN_END_DEG = 225;

const isAuroraLatBand = (value: string | undefined): value is AuroraLatBand =>
  value === "high" || value === "mid" || value === "low" || value === "equatorial";

const resolveAuroraLatBand = (notice: AuroraNotice): AuroraLatBand | undefined =>
  isAuroraLatBand(notice.latBand) ? notice.latBand : undefined;

const inRange = (time: Date, range: TimeRange): boolean =>
  time.getTime() >= range.start.getTime() && time.getTime() <= range.end.getTime();

const clampWindowToRange = (
  window: NoticeWindow,
  range: TimeRange
): NoticeWindow | undefined => {
  const start = new Date(Math.max(window.start.getTime(), range.start.getTime()));
  const end = new Date(Math.min(window.end.getTime(), range.end.getTime()));

  return start.getTime() <= end.getTime() ? { start, end } : undefined;
};

const endOfUtcDay = (utcDate: string): Date =>
  new Date(`${utcDate}T23:59:59.999Z`);

const startOfUtcDay = (utcDate: string): Date =>
  new Date(`${utcDate}T00:00:00.000Z`);

const isLikelyAustralianObserver = (observer: ObserverContext): boolean =>
  observer.latitude <= -9 && observer.latitude >= -55 && observer.longitude >= 95 && observer.longitude <= 180;

const isSouthwestWesternAustralia = (observer: ObserverContext): boolean =>
  observer.latitude <= -33 && observer.longitude >= 112 && observer.longitude <= 121;

const isObserverWithinKIndexVisibility = (
  observer: ObserverContext,
  kAus: number
): boolean => {
  if (!isLikelyAustralianObserver(observer)) {
    return false;
  }

  if (kAus >= 9) {
    return observer.latitude <= -10;
  }

  if (kAus >= 8) {
    return observer.latitude <= -28;
  }

  if (kAus >= 7) {
    return observer.latitude <= -35.5;
  }

  if (kAus >= 6) {
    return observer.latitude <= -38 || isSouthwestWesternAustralia(observer);
  }

  if (kAus >= 5) {
    return observer.latitude <= -38;
  }

  if (kAus >= 4) {
    return observer.latitude <= -40;
  }

  if (kAus >= 3) {
    return observer.latitude <= -42;
  }

  return false;
};

const isObserverWithinLatBand = (
  observer: ObserverContext,
  latBand: AuroraLatBand
): boolean => {
  if (!isLikelyAustralianObserver(observer)) {
    return false;
  }

  switch (latBand) {
    case "equatorial":
      return observer.latitude <= -10;
    case "low":
      return observer.latitude <= -28;
    case "mid":
      return observer.latitude <= -35.5;
    case "high":
      return observer.latitude <= -38 || isSouthwestWesternAustralia(observer);
  }
};

const isObserverWithinVisibilityRegion = (
  observer: ObserverContext,
  notice: AuroraNotice
): boolean => {
  const latBand = resolveAuroraLatBand(notice);

  return latBand !== undefined &&
    isObserverWithinKIndexVisibility(observer, notice.kAus ?? 0) &&
    isObserverWithinLatBand(observer, latBand);
};

const estimateAuroraAltitudeDeg = (
  observer: ObserverContext,
  latBand: AuroraLatBand
): number => {
  let altitude =
    observer.latitude <= -42
      ? 20
      : observer.latitude <= -39
        ? 15
        : observer.latitude <= -36
          ? 11
          : observer.latitude <= -32
            ? 7
            : 4;

  if (latBand === "mid") {
    altitude += 2;
  } else if (latBand === "low") {
    altitude += 4;
  } else if (latBand === "equatorial") {
    altitude += 6;
  }

  return Math.min(30, altitude);
};

const getNoticeWindow = (notice: AuroraNotice): NoticeWindow =>
  notice.kind === "alert"
    ? {
        start: notice.startTime,
        end: notice.validUntil
      }
    : {
        start: startOfUtcDay(notice.startDate),
        end: endOfUtcDay(notice.endDate)
      };

const getNoticeNarrative = (notice: AuroraNotice): string =>
  notice.kind === "alert" ? notice.description : notice.comments;

const getNoticeIssuedAt = (notice: AuroraNotice): Date =>
  notice.kind === "alert" ? notice.startTime : notice.issueTime;

const getNoticeConfidence = (notice: AuroraNotice): number => {
  const kAus = notice.kAus ?? 6;

  if (notice.kind === "alert") {
    return Math.max(0.75, Math.min(0.95, 0.72 + kAus * 0.03));
  }

  if (notice.kind === "watch") {
    return Math.max(0.62, Math.min(0.88, 0.56 + kAus * 0.03));
  }

  return Math.max(0.5, Math.min(0.8, 0.4 + kAus * 0.04));
};

const getNoticeTitle = (notice: AuroraNotice): string => {
  if (notice.kind === "alert") {
    return "Aurora alert";
  }

  if (notice.kind === "watch") {
    return "Aurora watch";
  }

  return "Aurora outlook";
};

const sampleTimes = (window: NoticeWindow): Date[] => {
  const times: Date[] = [];

  for (let timeMs = window.start.getTime(); timeMs <= window.end.getTime(); timeMs += HOUR_MS) {
    times.push(new Date(timeMs));
  }

  if (times.length === 0 || times[times.length - 1]!.getTime() !== window.end.getTime()) {
    times.push(window.end);
  }

  return times;
};

const findBestViewingWindow = (
  window: NoticeWindow,
  observer: ObserverContext,
  minDarkSkySunAltitudeDeg: number,
  skyContextResolver: (time: Date, observer: ObserverContext) => SkyContext
): BestViewingWindow | undefined => {
  let best: BestViewingWindow | undefined;

  for (const time of sampleTimes(window)) {
    const sky = skyContextResolver(time, observer);

    if (sky.sunAltitudeDeg > minDarkSkySunAltitudeDeg) {
      continue;
    }

    if (!best || sky.sunAltitudeDeg < best.sky.sunAltitudeDeg) {
      best = { time, sky };
    }
  }

  return best;
};

const buildDescription = (
  notice: AuroraNotice,
  observer: ObserverContext
): string => {
  const place = observer.locationLabel?.trim();
  const locationPrefix = place ? `${place} is within` : "Your location is within";

  return `${getNoticeNarrative(notice)} ${locationPrefix} BOM's ${notice.latBand}-latitude aurora visibility region.`;
};

const buildInstructionText = (
  notice: AuroraNotice,
  bestViewingWindow: BestViewingWindow
): string => {
  const issuedAt = getNoticeIssuedAt(notice).toISOString();

  return `BOM ${notice.kind} issued at ${issuedAt}. Around ${bestViewingWindow.time.toISOString()}, scan the southern horizon from SE through SW under dark skies.`;
};

export class AuroraEventSource implements AstronomyEventSource {
  private readonly client: BomSpaceWeatherNoticeClient;
  private readonly skyContextResolver: (time: Date, observer: ObserverContext) => SkyContext;
  private readonly minDarkSkySunAltitudeDeg: number;
  private readonly now: () => Date;

  public constructor(options: AuroraEventSourceOptions = {}) {
    this.client = options.client ?? new BomSpaceWeatherClient();
    this.skyContextResolver = options.skyContextResolver ?? getLocalSkyContext;
    this.minDarkSkySunAltitudeDeg = options.minDarkSkySunAltitudeDeg ?? -6;
    if (typeof options.now === "function") {
      this.now = options.now;
    } else if (options.now) {
      this.now = () => options.now as Date;
    } else {
      this.now = () => new Date();
    }
  }

  public async generateEvents(
    observer: ObserverContext,
    timeRange: TimeRange
  ): Promise<AstronomyEventCandidate[]> {
    const notices = await this.client.getAuroraNotices();
    const currentTime = this.now();

    return [...notices.alert, ...notices.watch, ...notices.outlook]
      .flatMap((notice) => this.noticeToEvent(notice, observer, timeRange, currentTime))
      .sort((left, right) => left.peakTime.getTime() - right.peakTime.getTime());
  }

  private noticeToEvent(
    notice: AuroraNotice,
    observer: ObserverContext,
    timeRange: TimeRange,
    currentTime: Date
  ): AstronomyEventCandidate[] {
    if (!isObserverWithinVisibilityRegion(observer, notice)) {
      return [];
    }

    const latBand = resolveAuroraLatBand(notice);

    if (!latBand) {
      return [];
    }

    const clampedWindow = clampWindowToRange(getNoticeWindow(notice), timeRange);

    if (!clampedWindow) {
      return [];
    }

    const bestViewingWindow = findBestViewingWindow(
      clampedWindow,
      observer,
      this.minDarkSkySunAltitudeDeg,
      this.skyContextResolver
    );

    if (!bestViewingWindow) {
      return [];
    }

    const issuedAt = getNoticeIssuedAt(notice);
    const peakTime = inRange(currentTime, clampedWindow)
      ? bestViewingWindow.time
      : bestViewingWindow.time;
    const altitudeDeg = estimateAuroraAltitudeDeg(observer, latBand);

    return [
      {
        id: `aurora-${notice.kind}-${issuedAt.toISOString().replace(/[-:.]/g, "")}-${Math.round(
          observer.latitude * 100
        )}-${Math.round(observer.longitude * 100)}`,
        eventType: "aurora",
        title: getNoticeTitle(notice),
        description: buildDescription(notice, observer),
        startTime: clampedWindow.start,
        peakTime,
        endTime: clampedWindow.end,
        sourceType: "live",
        sourceName: "bom-space-weather",
        confidence: getNoticeConfidence(notice),
        targetAzimuthDeg: AURORA_AZIMUTH_DEG,
        targetAltitudeDeg: altitudeDeg,
        targetDirectionLabel: "S",
        azimuthSpanStartDeg: AURORA_SPAN_START_DEG,
        azimuthSpanEndDeg: AURORA_SPAN_END_DEG,
        localBestViewingTime: bestViewingWindow.time,
        localBestViewingAzimuthDeg: AURORA_AZIMUTH_DEG,
        localBestViewingAltitudeDeg: altitudeDeg,
        localBestViewingDirectionLabel: "S",
        sunAltitudeDeg: bestViewingWindow.sky.sunAltitudeDeg,
        moonAltitudeDeg: bestViewingWindow.sky.moonAltitudeDeg,
        moonIllumination: bestViewingWindow.sky.moonIllumination,
        localBestViewingSunAltitudeDeg: bestViewingWindow.sky.sunAltitudeDeg,
        localBestViewingMoonAltitudeDeg: bestViewingWindow.sky.moonAltitudeDeg,
        localBestViewingMoonIllumination: bestViewingWindow.sky.moonIllumination,
        instructionText: buildInstructionText(notice, bestViewingWindow)
      }
    ];
  }
}
