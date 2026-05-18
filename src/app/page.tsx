'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import * as THREE from 'three';

interface Star {
  x: number;
  y: number;
  r: number;           // core radius (CSS px)
  baseA: number;       // baseline alpha
  twinkleAmp: number;  // twinkle amplitude (0 = still)
  freq1: number;       // primary twinkle frequency
  freq2: number;       // secondary (adds irregularity)
  phase: number;
  color: string;       // "r,g,b" triple
  glowR: number;       // soft halo radius; 0 = none
  glowA: number;       // halo peak alpha multiplier
}
interface Nebula {
  x: number; y: number; rx: number; ry: number; c: string;
}

// Curated stellar color palette, skewed toward warm/neutral (our warm text
// palette) with a handful of cool blue-white sprinkled in. Real stars span
// a much wider gamut, but a tight curated set reads as intentional rather
// than noisy.
const STAR_COLORS = [
  '255,245,220', // neutral
  '255,240,210',
  '255,235,180', // warm (matches the UI accent)
  '255,230,170',
  '255,220,140', // amber giant
  '255,205,120',
  '255,180,120', // orange K-type
  '220,225,255', // cool blue-white
  '200,215,255',
  '255,255,245', // near-white
];

interface PlanetDef {
  name: string;
  info: string;
  texture: string;
  size: number;
  orbitR: number;
  period: number;
  offset: number;
  tilt: number; // axial tilt in radians
  spin: number; // radians/sec
  hasRings?: boolean;
}

interface BodyRef {
  name: string;
  info: string;
  orbitGroup: THREE.Group;       // holds orbital position
  tiltGroup: THREE.Group;        // holds axial tilt
  mesh: THREE.Mesh;              // the planet sphere
  hitMesh: THREE.Mesh;           // invisible larger mesh for easy hover
  orbitLine?: THREE.LineLoop;
  spin: number;
}

interface RecommendedEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  displayDescription?: string;
  startTime: string;
  peakTime: string;
  endTime: string;
  instructionText?: string;
  targetAzimuthDeg?: number;
  targetAltitudeDeg?: number;
  targetDirectionLabel?: string;
  localBestViewingTime?: string;
  localBestViewingAzimuthDeg?: number;
  localBestViewingAltitudeDeg?: number;
  localBestViewingDirectionLabel?: string;
  cloudCoverPct?: number;
  lowCloudCoverPct?: number;
  cloudCoverMidPct?: number;
  cloudCoverHighPct?: number;
  visibilityKm?: number;
  precipitationProbabilityPct?: number;
  windSpeedKph?: number;
  temperatureC?: number;
  weatherForecastTimeUtc?: string;
  weatherForecastProvider?: string;
  weatherForecastDeltaMinutes?: number;
  coolScore?: number;
  finalScore?: number;
}

interface ForecastHour {
  timeUtc: string;
  cloudCoverPct?: number;
  cloudCoverLowPct?: number;
  cloudCoverMidPct?: number;
  cloudCoverHighPct?: number;
  precipitationProbabilityPct?: number;
  visibilityKm?: number;
  windSpeedKph?: number;
  temperatureC?: number;
}

interface SolarTransition {
  kind: 'sunrise' | 'sunset';
  timeUtc: string;
}

interface RecommendationResponse {
  events: RecommendedEvent[];
  solarTransitions: SolarTransition[];
  forecast?: {
    timezone: string;
    hours: ForecastHour[];
  };
  metadata: {
    generatedAt: string;
    start: string;
    end: string;
    locationLabel?: string;
  };
}

const recommendationCache = new Map<string, RecommendationResponse>();
const recommendationRequests = new Map<string, Promise<RecommendationResponse>>();
let initialLocationRequest: Promise<RecommendationLocation> | undefined;

interface RecommendationLocation {
  latitude: number;
  longitude: number;
  label: string;
}

function recommendationKey(input: {
  latitude: number;
  longitude: number;
  label: string;
  days: number;
  maxResults: number;
}) {
  return JSON.stringify({
    latitude: Number(input.latitude.toFixed(4)),
    longitude: Number(input.longitude.toFixed(4)),
    label: input.label,
    days: input.days,
    maxResults: input.maxResults,
  });
}

async function fetchRecommendations(input: {
  latitude: number;
  longitude: number;
  label: string;
  days: number;
  maxResults: number;
}): Promise<RecommendationResponse> {
  const key = recommendationKey(input);
  const cached = recommendationCache.get(key);

  if (cached) {
    return cached;
  }

  const existingRequest = recommendationRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch('/api/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude: input.latitude,
      longitude: input.longitude,
      locationLabel: input.label,
      days: input.days,
      maxResults: input.maxResults,
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    }),
  })
    .then(async (response) => {
      const payload = (await response.json()) as RecommendationResponse | { error: string };

      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error : 'Unable to load events.');
      }

      recommendationCache.set(key, payload);
      return payload;
    })
    .finally(() => {
      recommendationRequests.delete(key);
    });

  recommendationRequests.set(key, request);
  return request;
}

function resolveInitialLocation(): Promise<RecommendationLocation> {
  if (initialLocationRequest) {
    return initialLocationRequest;
  }

  if (!navigator.geolocation) {
    return Promise.reject(new Error('Location access is required to load events for your current sky.'));
  }

  initialLocationRequest = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: 'Current location',
        });
      },
      (error) => {
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Location permission is required to load events for your current sky.'
              : 'Unable to determine your current location.'
          )
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 15 * 60 * 1000,
      },
    );
  });

  return initialLocationRequest;
}

function titleLines(title: string) {
  if (title.includes(':')) {
    const [lead, tail] = title.split(/:\s*/, 2);
    return { lead, accent: tail };
  }

  const words = title.split(' ');
  if (words.length === 2) {
    return { lead: words[0], accent: words[1] };
  }

  return { lead: title, accent: undefined };
}

function eventChipLabel(event: RecommendedEvent): string {
  return event.title.split(':')[0] ?? event.title;
}

function fallbackEventChipWidthPx(label: string): number {
  return Math.max(112, Math.ceil(label.length * 10 + 36));
}

function sortEventsByOccurrence(events: RecommendedEvent[]) {
  return [...events].sort(
    (left, right) =>
      new Date(left.peakTime).getTime() - new Date(right.peakTime).getTime() ||
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
}

function formatEventDate(value?: string) {
  if (!value) return 'Awaiting timing';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function formatCurrentDateTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

function formatScore(value?: number) {
  return Math.max(0, Math.min(99, Math.round(value ?? 0)));
}

function formatDirectionDegrees(value?: number) {
  return value === undefined ? 'n/a' : `${Math.round(value)}°`;
}

function formatAltitude(value?: number) {
  return value === undefined ? 'n/a' : `${Math.round(value)}°`;
}

function formatClockTime(value?: string) {
  if (!value) return '--:--';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function formatShortDate(value?: string) {
  if (!value) return 'Awaiting timing';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatBoundary(event: RecommendedEvent | undefined, edge: 'start' | 'end') {
  if (!event) {
    return {
      value: '--:--',
      label: edge === 'start' ? 'Start time' : 'End time',
    };
  }

  const boundary = edge === 'start' ? event.startTime : event.endTime;

  return {
    value: formatClockTime(boundary),
    label: `${edge === 'start' ? 'Starts' : 'Ends'} ${formatShortDate(boundary)}`,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTimelineHours(forecastHours: ForecastHour[]) {
  if (forecastHours.length === 0) return [];

  return forecastHours;
}

function formatTimelineTick(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatPhaseMarkerTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCloudTooltipTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function phaseMarkerLabel(kind: SolarTransition['kind']) {
  return kind === 'sunrise' ? 'Sunrise' : 'Sunset';
}

// ─── Smooth SVG path helper (cardinal spline) ────────────────────────────────
function cardinalSplinePath(points: [number, number][], tension = 0.35): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;
  const parts: string[] = [`M ${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    parts.push(`C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  return parts.join(' ');
}

// ─── Unified sky panel: cloud forecast + event timeline ───────────────────────
function SkyPanel({
  forecastHours,
  events,
  solarTransitions,
  selectedEvent,
  onSelectEvent,
}: {
  forecastHours: ForecastHour[];
  events: RecommendedEvent[];
  solarTransitions: SolarTransition[];
  selectedEvent?: RecommendedEvent;
  onSelectEvent: (event: RecommendedEvent) => void;
}) {
  const CLOUD_H = 52;
  const PILL_H = 20;
  const PILL_GAP = 3;
  const LANE_PAD = 4;
  const PHASE_MARKER_HALF_W = 8;
  const laneRef = useRef<HTMLDivElement | null>(null);
  const pillLabelMeasureRef = useRef<HTMLSpanElement | null>(null);
  const [laneWidthPx, setLaneWidthPx] = useState(0);
  const [activeCloudIndex, setActiveCloudIndex] = useState<number | null>(null);
  const [pillLabelWidths, setPillLabelWidths] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;

    const updateLaneWidth = () => {
      const laneWidth = lane.getBoundingClientRect().width;
      const parentWidth = lane.parentElement?.getBoundingClientRect().width ?? 0;
      const nextWidth = Math.max(laneWidth, parentWidth);

      if (nextWidth > 0) {
        setLaneWidthPx(nextWidth);
      }
    };

    updateLaneWidth();
    const rafId = window.requestAnimationFrame(updateLaneWidth);

    const observer = new ResizeObserver(() => {
      updateLaneWidth();
    });
    observer.observe(lane);
    if (lane.parentElement) {
      observer.observe(lane.parentElement);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const measureEl = pillLabelMeasureRef.current;
    if (!measureEl) return;

    const labels = Array.from(new Set(events.map(eventChipLabel)));
    if (labels.length === 0) {
      setPillLabelWidths({});
      return;
    }

    let cancelled = false;

    const measureLabels = () => {
      if (cancelled) return;

      const nextWidths: Record<string, number> = {};
      for (const label of labels) {
        measureEl.textContent = label;
        const measuredWidth = Math.ceil(measureEl.getBoundingClientRect().width);
        nextWidths[label] = Math.max(112, measuredWidth + 36);
      }

      measureEl.textContent = '';
      setPillLabelWidths(nextWidths);
    };

    measureLabels();

    void document.fonts?.ready.then(() => {
      measureLabels();
    });

    return () => {
      cancelled = true;
    };
  }, [events]);

  // Sort ascending so timeline always goes left → right (earlier → later)
  const timelineHours = buildTimelineHours(forecastHours)
    .sort((a, b) => new Date(a.timeUtc).getTime() - new Date(b.timeUtc).getTime());

  if (timelineHours.length === 0) return null;

  const N = timelineHours.length;
  const timelineStartMs = new Date(timelineHours[0].timeUtc).getTime();
  const timelineEndMs = new Date(timelineHours[N - 1].timeUtc).getTime() + 60 * 60 * 1000;
  const totalRangeMs = Math.max(1, timelineEndMs - timelineStartMs);

  // ms → left% helper (same formula for cloud points, events AND ticks → perfect alignment)
  const msToP = (ms: number) => clamp((ms - timelineStartMs) / totalRangeMs * 100, 0, 100);

  const nowMs = Date.now();
  const nowPct = msToP(nowMs);
  const showNow = nowMs >= timelineStartMs && nowMs <= timelineEndMs;

  // Cloud area path — x driven by actual ms position so it aligns with the time axis
  const cloudSamples = timelineHours.map(hour => {
    const x = msToP(new Date(hour.timeUtc).getTime() + 30 * 60 * 1000); // centre of hour
    const y = CLOUD_H - ((hour.cloudCoverPct ?? 0) / 100) * CLOUD_H;
    return {
      x,
      y,
      timeUtc: hour.timeUtc,
      cloudCoverPct: Math.round(hour.cloudCoverPct ?? 0),
    };
  });
  const cloudPoints: [number, number][] = cloudSamples.map(sample => [sample.x, sample.y]);
  const strokePath = cardinalSplinePath(cloudPoints, 0.35);
  const fillPath = `${strokePath} L 100,${CLOUD_H} L 0,${CLOUD_H} Z`;
  const cloudHoverTargets = cloudSamples.map((sample, index) => {
    const prevX = index === 0 ? 0 : (cloudSamples[index - 1].x + sample.x) / 2;
    const nextX = index === cloudSamples.length - 1 ? 100 : (sample.x + cloudSamples[index + 1].x) / 2;

    return {
      ...sample,
      left: prevX,
      width: Math.max(2, nextX - prevX),
    };
  });
  const activeCloudSample =
    activeCloudIndex === null ? undefined : cloudSamples[activeCloudIndex];

  // Precipitation overlay
  const precipPoints: [number, number][] = timelineHours.map(hour => {
    const x = msToP(new Date(hour.timeUtc).getTime() + 30 * 60 * 1000);
    const precip = hour.precipitationProbabilityPct ?? 0;
    const y = CLOUD_H - (precip / 100) * CLOUD_H * 0.65;
    return [x, y];
  });
  const precipStroke = cardinalSplinePath(precipPoints, 0.35);
  const precipFill = `${precipStroke} L 100,${CLOUD_H} L 0,${CLOUD_H} Z`;
  const hasPrecip = timelineHours.some(h => (h.precipitationProbabilityPct ?? 0) > 5);

  const transitions = solarTransitions.flatMap((transition) => {
    const transitionMs = new Date(transition.timeUtc).getTime();

    if (transitionMs < timelineStartMs || transitionMs > timelineEndMs) {
      return [];
    }

    return [{
      ...transition,
      pct: msToP(transitionMs),
    }];
  });

  // Event pills — ms-based positioning + greedy row stacking
  const rawEvents = events
    .flatMap(event => {
      const startMs = new Date(event.startTime).getTime();
      const endMs = new Date(event.endTime).getTime();
      if (endMs < timelineStartMs || startMs > timelineEndMs) return [];
      const rawLeft = msToP(Math.max(startMs, timelineStartMs));
      const rawRight = msToP(Math.min(endMs, timelineEndMs));
      const label = eventChipLabel(event);
      const effectiveLaneWidthPx = laneWidthPx || laneRef.current?.parentElement?.getBoundingClientRect().width || 0;
      if (effectiveLaneWidthPx <= 0) {
        return [];
      }

      const rawLeftPx = (rawLeft / 100) * effectiveLaneWidthPx;
      const rawRightPx = (rawRight / 100) * effectiveLaneWidthPx;
      const minReadableWidthPx = pillLabelWidths[label] ?? fallbackEventChipWidthPx(label);
      const widthPx = Math.min(
        effectiveLaneWidthPx,
        Math.max(rawRightPx - rawLeftPx, minReadableWidthPx, 40)
      );
      const centerPx = (rawLeftPx + rawRightPx) / 2;
      const leftPx = clamp(centerPx - widthPx / 2, 0, effectiveLaneWidthPx - widthPx);

      return [{ event, startMs, leftPx, widthPx }];
    })
    .sort((left, right) => left.startMs - right.startMs || left.leftPx - right.leftPx);

  // Greedy interval scheduling → row index per pill
  const rowEnds: number[] = [];
  const pillsWithRows = rawEvents.map(entry => {
    let row = rowEnds.findIndex(end => entry.leftPx >= end + 6);
    if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
    rowEnds[row] = entry.leftPx + entry.widthPx;
    return { ...entry, row };
  });
  const numRows = Math.max(1, rowEnds.length);
  const laneH = LANE_PAD * 2 + numRows * PILL_H + (numRows - 1) * PILL_GAP;

  // Time axis ticks — 5 evenly spaced, ms-based
  const TICK_COUNT = 5;
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => ({
    label: formatTimelineTick(new Date(timelineStartMs + (i / (TICK_COUNT - 1)) * totalRangeMs).toISOString()),
    pct: (i / (TICK_COUNT - 1)) * 100,
  }));

  return (
    <section className="sky-panel" aria-label="Cloud forecast and sky events">
      <div className="sky-panel-inner">

        {/* Cloud header */}
        <div className="sky-cloud-header">
          <span className="sky-cloud-icon" aria-hidden="true">&#9729;</span>
          <span className="sky-cloud-label">Cloud cover</span>
          <span ref={pillLabelMeasureRef} className="sky-pill-label sky-pill-label-measure" aria-hidden="true">Measure</span>
        </div>

        {/* Cloud SVG + phase markers overlay */}
        <div
          className="sky-cloud-wrap"
          onMouseLeave={() => setActiveCloudIndex(null)}
        >
          <svg
            className="sky-cloud-svg"
            viewBox={`0 0 100 ${CLOUD_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="sky-cloud-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(190,210,255,0.50)" />
                <stop offset="100%" stopColor="rgba(190,210,255,0.03)" />
              </linearGradient>
              <linearGradient id="sky-precip-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(90,160,255,0.40)" />
                <stop offset="100%" stopColor="rgba(90,160,255,0.02)" />
              </linearGradient>
            </defs>

            {/* Precipitation fill */}
            {hasPrecip && <path d={precipFill} fill="url(#sky-precip-grad)" />}

            {/* Cloud fill */}
            <path d={fillPath} fill="url(#sky-cloud-grad)" />

            <line
              className="sky-cloud-demarcation"
              x1="0"
              y1="0.5"
              x2="100"
              y2="0.5"
            />

            {/* Cloud stroke */}
            <path d={strokePath} fill="none" stroke="rgba(190,210,255,0.30)" strokeWidth="0.5" />
            {activeCloudSample && (
              <>
                <line
                  className="sky-cloud-hover-guide"
                  x1={activeCloudSample.x}
                  y1="0"
                  x2={activeCloudSample.x}
                  y2={CLOUD_H}
                />
                <circle
                  cx={activeCloudSample.x}
                  cy={activeCloudSample.y}
                  r="2.5"
                  fill="rgba(190,210,255,0.18)"
                />
                <circle
                  cx={activeCloudSample.x}
                  cy={activeCloudSample.y}
                  r="1.1"
                  fill="rgba(255,235,180,0.92)"
                />
              </>
            )}
          </svg>

          {activeCloudSample && (
            <div
              className="sky-cloud-tooltip"
              style={{
                left: `clamp(34px, ${activeCloudSample.x}%, calc(100% - 34px))`,
                top: `${(activeCloudSample.y / CLOUD_H) * 100}%`,
              }}
              role="status"
              aria-live="polite"
            >
              <span className="sky-cloud-tooltip-value">{activeCloudSample.cloudCoverPct}% cloud</span>
              <span className="sky-cloud-tooltip-time">{formatCloudTooltipTime(activeCloudSample.timeUtc)}</span>
            </div>
          )}

          <span className="sky-cloud-100-label" aria-hidden="true">100%</span>

          <div className="sky-cloud-hit-area">
            {cloudHoverTargets.map((sample, index) => (
              <button
                key={sample.timeUtc}
                className={`sky-cloud-hit${index === activeCloudIndex ? ' active' : ''}`}
                style={{
                  left: `${sample.left}%`,
                  width: `${sample.width}%`,
                }}
                onMouseEnter={() => setActiveCloudIndex(index)}
                onFocus={() => setActiveCloudIndex(index)}
                onBlur={() => setActiveCloudIndex(null)}
                type="button"
                aria-label={`Cloud cover ${sample.cloudCoverPct}% at ${formatCloudTooltipTime(sample.timeUtc)}`}
              />
            ))}
          </div>

          {/* Phase transition icon markers — HTML so we can use real pixel sizes */}
          {transitions.map((t, idx) => (
            <div
              key={idx}
              className={`sky-phase-marker sky-phase-${t.kind}`}
              style={{ left: `clamp(${PHASE_MARKER_HALF_W}px, ${t.pct}%, calc(100% - ${PHASE_MARKER_HALF_W}px))` }}
              aria-label={`${phaseMarkerLabel(t.kind)} at ${formatPhaseMarkerTime(t.timeUtc)}`}
              role="img"
              tabIndex={0}
            >
              <div className="sky-phase-tooltip">
                <span className="sky-phase-name">{phaseMarkerLabel(t.kind)}</span>
                <span className="sky-phase-time">{formatPhaseMarkerTime(t.timeUtc)}</span>
              </div>
              {t.kind === 'sunset' ? (
                /* Moon crescent */
                <svg width="12" height="12" viewBox="-1 -1 12 12">
                  <path d="M5,1.2 A4.3,4.3,0,1,0,5,8.8 A3,3,0,1,1,5,1.2 Z" fill="rgba(180,205,255,0.70)" />
                </svg>
              ) : (
                /* Sun with rays */
                <svg width="12" height="12" viewBox="-1 -1 12 12">
                  <circle cx="5" cy="5" r="1.9" fill="rgba(255,215,80,0.80)" />
                  {([0,45,90,135,180,225,270,315] as number[]).map(deg => {
                    const r = Math.PI / 180 * deg;
                    return <line key={deg}
                      x1={5 + Math.cos(r)*2.6} y1={5 + Math.sin(r)*2.6}
                      x2={5 + Math.cos(r)*3.5} y2={5 + Math.sin(r)*3.5}
                      stroke="rgba(255,215,80,0.65)" strokeWidth="0.8" strokeLinecap="round"
                    />;
                  })}
                </svg>
              )}
            </div>
          ))}
          {/* Now needle — HTML overlay so SVG mask-image doesn't dim it */}
          {showNow && (
            <div className="sky-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />
          )}

        </div>

        {/* Event pill lane — height grows with number of rows */}
        <div
          ref={laneRef}
          className="sky-event-lane"
          style={{ height: `${laneH}px` }}
        >
          {pillsWithRows.map(({ event, leftPx, widthPx, row }) => (
            <button
              key={event.id}
              className={`sky-pill${event.id === selectedEvent?.id ? ' active' : ''}`}
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                top: `${LANE_PAD + row * (PILL_H + PILL_GAP)}px`,
                height: `${PILL_H}px`,
              }}
              onClick={() => onSelectEvent(event)}
              type="button"
              title={event.title}
            >
              {/* Pill width can expand beyond the literal event span to keep the label legible */}
              <span className="sky-pill-label">{eventChipLabel(event)}</span>
            </button>
          ))}
          {/* Now needle through pill lane */}
          {showNow && <div className="sky-now" style={{ left: `${nowPct}%` }} />}
        </div>

        {/* Time axis */}
        <div className="sky-time-axis">
          {ticks.map(tick => (
            <span key={tick.pct} className="sky-tick" style={{ left: `${tick.pct}%` }}>
              {tick.label}
            </span>
          ))}
        </div>

      </div>
    </section>
  );
}



export default function OrreryPage() {
  const [events, setEvents] = useState<RecommendedEvent[]>([]);
  const [forecastHours, setForecastHours] = useState<ForecastHour[]>([]);
  const [solarTransitions, setSolarTransitions] = useState<SolarTransition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [locationLabel, setLocationLabel] = useState('Current location');
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();
  const latestRequestId = useRef(0);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    let intervalId: number | undefined;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = window.setTimeout(() => {
      updateTime();
      intervalId = window.setInterval(updateTime, 60_000);
    }, msUntilNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations(location: {
      latitude: number;
      longitude: number;
      label: string;
    }) {
      const requestId = ++latestRequestId.current;
      setIsLoading(true);
      setQueryError(null);

      try {
        const payload = await fetchRecommendations({
          latitude: location.latitude,
          longitude: location.longitude,
          label: location.label,
          days: 7,
          maxResults: 8,
        });

        if (cancelled || requestId !== latestRequestId.current) {
          return;
        }

        const nextLocationLabel = payload.metadata.locationLabel ?? location.label;
        const sortedEvents = sortEventsByOccurrence(payload.events);
        startTransition(() => {
          setEvents((previousEvents) => {
            const previousSelectedId = previousEvents[selectedIndex]?.id;
            const nextSelectedIndex = previousSelectedId
              ? sortedEvents.findIndex((event) => event.id === previousSelectedId)
              : -1;

            setSelectedIndex(nextSelectedIndex >= 0 ? nextSelectedIndex : 0);
            return sortedEvents;
          });
          setForecastHours(payload.forecast?.hours ?? []);
          setSolarTransitions(payload.solarTransitions ?? []);
          setLocationLabel(nextLocationLabel);
          setIsLoading(false);
        });
      } catch (error) {
        if (cancelled || requestId !== latestRequestId.current) {
          return;
        }

        setQueryError(error instanceof Error ? error.message : 'Unable to load events.');
        setEvents([]);
        setForecastHours([]);
        setSolarTransitions([]);
        setSelectedIndex(0);
        setLocationLabel(location.label);
        setIsLoading(false);
      }
    }

    void resolveInitialLocation()
      .then((location) => {
        if (!cancelled) {
          void loadRecommendations(location);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setQueryError(error instanceof Error ? error.message : 'Unable to determine your current location.');
        setEvents([]);
        setForecastHours([]);
        setSolarTransitions([]);
        setSelectedIndex(0);
        setLocationLabel('Current location');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // ─── Background (stars + nebulae, 2D canvas) ──────────────────────────────
    const bgCanvas = document.getElementById('bg') as HTMLCanvasElement;
    const bgCtx = bgCanvas.getContext('2d')!;
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    // Logical (CSS) size of the background; drawing code operates in these
    // units while the backing store is scaled up for the device's pixel ratio
    // so stars/nebulae stay crisp on high-DPI phones & retina displays.
    let bgW = 0;
    let bgH = 0;

    function initBg() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      bgW = window.innerWidth;
      bgH = window.innerHeight;
      bgCanvas.width  = Math.round(bgW * dpr);
      bgCanvas.height = Math.round(bgH * dpr);
      bgCanvas.style.width  = `${bgW}px`;
      bgCanvas.style.height = `${bgH}px`;
      // Reset any previous transform, then scale so 1 drawing unit = 1 CSS px.
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Three layers of stars so the sky reads with depth rather than as a
      // uniform field of pulsing dots:
      //   dust    — sub-pixel grain. Dense, very dim, nearly still. This is
      //             the "photographic" base layer that makes the field read
      //             as a sky rather than a handful of dots.
      //   mid     — main star count, slow irregular twinkle, tight halo.
      //   hero    — rare bright standouts with a soft halo. No spikes —
      //             diffraction crosses are a telescope/camera artifact and
      //             read as stylized/cartoony on a web background.
      //
      // Counts scale with viewport area so phones don't feel empty and huge
      // displays don't feel noisy. The core/halo radii are kept deliberately
      // small so that even the brightest star is visibly smaller than the
      // smallest planet (Mercury ≈ 4 CSS px radius on-screen).
      const area = bgW * bgH;
      const dustCount = Math.round(Math.min(2200, Math.max(700, area / 2200)));
      const midCount  = Math.round(Math.min(550,  Math.max(160, area / 8500)));
      const heroCount = Math.round(Math.min(26,   Math.max(8,   area / 140000)));

      const rand = () => Math.random();
      // Power-law size: most stars small, a few noticeably larger. The
      // exponent controls the skew; higher = more small stars.
      const powSize = (min: number, max: number, skew = 2.5) =>
        min + (max - min) * Math.pow(rand(), skew);

      const pickColor = (warmBias: number) =>
        STAR_COLORS[
          Math.min(
            STAR_COLORS.length - 1,
            Math.floor(Math.pow(rand(), warmBias) * STAR_COLORS.length),
          )
        ];

      stars = [];

      for (let i = 0; i < dustCount; i++) {
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r: 0.22 + rand() * 0.38,     // sub-pixel to ~0.6 px
          baseA: 0.12 + rand() * 0.18,
          twinkleAmp: rand() * 0.05,    // barely breathes
          freq1: 0.2 + rand() * 0.4,
          freq2: 0.15 + rand() * 0.3,
          phase: rand() * Math.PI * 2,
          color: pickColor(1.4),
          glowR: 0,
          glowA: 0,
        });
      }

      for (let i = 0; i < midCount; i++) {
        // Prefer warm stars (bias toward start of palette) — matches the
        // rest of the UI's warm accent temperature.
        const r = powSize(0.4, 1.0, 2.2);
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r,
          baseA: 0.3 + rand() * 0.3,
          twinkleAmp: 0.08 + rand() * 0.2,
          // Each star picks its own primary/secondary twinkle frequencies
          // from a non-commensurate range — the beats between them break
          // the "everything breathing in sync" look of a single sine.
          freq1: 0.35 + rand() * 1.8,
          freq2: 0.25 + rand() * 1.1,
          phase: rand() * Math.PI * 2,
          color: pickColor(1.5),
          // Tight halo — only ~1.4–2.2× the core so the halo reads as a
          // soft edge, not a glowing blob.
          glowR: r * (1.4 + rand() * 0.8),
          glowA: 0.18,
        });
      }

      for (let i = 0; i < heroCount; i++) {
        const r = 0.9 + rand() * 0.6;   // 0.9 – 1.5 px — still a pinpoint
        stars.push({
          x: rand() * bgW,
          y: rand() * bgH,
          r,
          baseA: 0.6 + rand() * 0.3,
          twinkleAmp: 0.12 + rand() * 0.22,
          freq1: 0.25 + rand() * 1.0,
          freq2: 0.2 + rand() * 0.8,
          phase: rand() * Math.PI * 2,
          color: pickColor(1.0),      // broader color spread for heroes
          // Hero halo is tighter than before (2.5–4× core vs old 4–7×) so
          // even the brightest star sits well under Mercury's on-screen
          // size rather than competing with it.
          glowR: r * (2.5 + rand() * 1.5),
          glowA: 0.22,
        });
      }

      nebulae = [
        { x: bgW * 0.22, y: bgH * 0.28, rx: 380, ry: 240, c: 'rgba(80,20,130,0.07)' },
        { x: bgW * 0.78, y: bgH * 0.72, rx: 300, ry: 400, c: 'rgba(140,40,20,0.055)' },
        { x: bgW * 0.60, y: bgH * 0.18, rx: 220, ry: 200, c: 'rgba(20,55,130,0.045)' },
      ];
    }

    function drawBg(ts: number) {
      const t = ts * 0.001;
      bgCtx.clearRect(0, 0, bgW, bgH);

      // Nebulae first (underneath everything).
      nebulae.forEach(n => {
        const mx = Math.max(n.rx, n.ry);
        const g = bgCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, mx);
        g.addColorStop(0, n.c);
        g.addColorStop(1, 'transparent');
        bgCtx.save();
        bgCtx.translate(n.x, n.y);
        bgCtx.scale(n.rx / mx, n.ry / mx);
        bgCtx.beginPath();
        bgCtx.arc(0, 0, mx, 0, Math.PI * 2);
        bgCtx.fillStyle = g;
        bgCtx.fill();
        bgCtx.restore();
      });

      // Stars — additive so overlapping glows brighten rather than occlude.
      bgCtx.save();
      bgCtx.globalCompositeOperation = 'lighter';
      stars.forEach(s => {
        // Two non-harmonic sines summed give a twinkle that never quite
        // repeats; clamp keeps it always bright-ish (stars don't fully
        // "turn off" in real life).
        const tw = 0.6 * Math.sin(t * s.freq1 + s.phase)
                 + 0.4 * Math.sin(t * s.freq2 + s.phase * 1.7);
        const a = Math.max(0.05, s.baseA + s.twinkleAmp * tw);

        // Optional soft halo for mid/hero stars. Kept tight and low-alpha so
        // the star still reads as a pinpoint with a subtle bloom, not a blob.
        if (s.glowR > 0) {
          const haloA = a * s.glowA;
          const hg = bgCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.glowR);
          hg.addColorStop(0, `rgba(${s.color},${haloA})`);
          hg.addColorStop(0.5, `rgba(${s.color},${haloA * 0.25})`);
          hg.addColorStop(1, `rgba(${s.color},0)`);
          bgCtx.fillStyle = hg;
          bgCtx.beginPath();
          bgCtx.arc(s.x, s.y, s.glowR, 0, Math.PI * 2);
          bgCtx.fill();
        }

        // Core.
        bgCtx.beginPath();
        bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(${s.color},${a})`;
        bgCtx.fill();
      });
      bgCtx.restore();
    }

    // ─── Three.js orrery ──────────────────────────────────────────────────────
    const oc = document.getElementById('orrery-canvas') as HTMLCanvasElement;

    const renderer = new THREE.WebGLRenderer({
      canvas: oc,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    // Cap at 3 — modern phones report DPR=3, and 3x is the practical limit
    // where extra pixels still buy perceptible sharpness on a WebGL scene
    // this small. Going higher is pure GPU cost.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));

    function sizeRenderer() {
      const rect = oc.getBoundingClientRect();
      // Guard against zero-sized layouts (e.g. hidden during initial paint).
      if (rect.width === 0 || rect.height === 0) return;
      // Keep pixel ratio in sync in case the user drags the window between
      // retina and non-retina displays, or the system zoom level changes.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
      renderer.setSize(rect.width, rect.height, false);
    }
    sizeRenderer();

    const scene = new THREE.Scene();

    // Orthographic camera with a subtle tilt so planet spheres read as 3D
    // while orbit circles remain near-circles.
    const FRUSTUM = 450;
    const camera = new THREE.OrthographicCamera(
      -FRUSTUM, FRUSTUM, FRUSTUM, -FRUSTUM, 0.1, 4000,
    );
    const CAM_TILT = 0.38; // ~22° off vertical
    const CAM_DIST = 1200;
    camera.position.set(
      0,
      CAM_DIST * Math.cos(CAM_TILT),
      CAM_DIST * Math.sin(CAM_TILT),
    );
    camera.lookAt(0, 0, 0);

    // Lights — point light at the Sun gives realistic phase shading on
    // planets. decay=0 keeps outer planets from being too dim; physical decay
    // would make Neptune ~36× darker than Mercury. The MeshStandardMaterial
    // BRDF divides Lambert by π which eats ~70% of the light, so we push the
    // Sun intensity well above unity to get vibrant planets.
    const sunLight = new THREE.PointLight(0xfff4d8, 4.0, 0, 0);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);
    // Warm ambient so night sides read rather than going pitch black.
    scene.add(new THREE.AmbientLight(0x45506a, 0.55));

    // Texture loader with sRGB color space
    const texLoader = new THREE.TextureLoader();
    const loadedTextures: THREE.Texture[] = [];
    function loadTex(path: string, opts: { srgb?: boolean } = {}) {
      const tex = texLoader.load(path, () => {
        // Trigger a re-render as soon as the texture is available — without
        // this the planet can pop in a frame late and look stale.
        tex.needsUpdate = true;
      });
      tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // Trilinear filtering + anisotropy — sharp up close, no shimmer at
      // oblique angles (visible on Saturn's rings and thin crescents).
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      loadedTextures.push(tex);
      return tex;
    }

    // ─── Sun ──────────────────────────────────────────────────────────────────
    const BODY_VISUAL_SCALE = 1.12;
    const SUN_RADIUS = 40 * BODY_VISUAL_SCALE;
    // User explicitly asked for the 8k sun. Note: Solar System Scope labels
    // their highest-res sun as "8k" but it's actually 4096×2048. It's still
    // 4× the area of the previous 2k map so surface granulation reads
    // clearly on retina displays.
    const sunTex = loadTex('/textures/8k_sun.jpg');
    const sunMesh = new THREE.Mesh(
      // Higher tessellation so the silhouette stays round on hi-DPI phones.
      new THREE.SphereGeometry(SUN_RADIUS, 128, 128),
      new THREE.MeshBasicMaterial({ map: sunTex }),
    );
    scene.add(sunMesh);

    // Glow sprites (radial gradients) around the sun
    function makeGlowTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
      const cvs = document.createElement('canvas');
      const SIZE = 1024;
      cvs.width = cvs.height = SIZE;
      const c = cvs.getContext('2d')!;
      const half = SIZE / 2;
      const g = c.createRadialGradient(half, half, 0, half, half, half);
      stops.forEach(([t, color]) => g.addColorStop(t, color));
      c.fillStyle = g;
      c.fillRect(0, 0, SIZE, SIZE);
      const t = new THREE.CanvasTexture(cvs);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      loadedTextures.push(t);
      return t;
    }

    const coronaTex = makeGlowTexture([
      [0.0,  'rgba(255,230,130,0.95)'],
      [0.2,  'rgba(255,180,60,0.55)'],
      [0.55, 'rgba(255,110,20,0.18)'],
      [1.0,  'rgba(255,80,0,0.0)'],
    ]);
    const haloTex = makeGlowTexture([
      [0.0, 'rgba(255,200,80,0.55)'],
      [0.4, 'rgba(255,120,30,0.16)'],
      [1.0, 'rgba(255,80,0,0.0)'],
    ]);
    // An extra cooler, softer outer bloom that layers under the warm halo
    // and breathes at its own slow cadence. Gives the glow a dual-tone
    // warm-core / cool-outer feel closer to real solar photographs.
    const bloomTex = makeGlowTexture([
      [0.0, 'rgba(255,200,120,0.22)'],
      [0.35, 'rgba(255,140,80,0.09)'],
      [0.75, 'rgba(255,110,60,0.03)'],
      [1.0,  'rgba(180,100,60,0.0)'],
    ]);

    // Corona — tight inner glow parented to the Sun. Small enough that it
    // never reaches any planet's orbit (Mercury is at 75), so normal depth
    // testing never causes it to overlap a planet.
    const CORONA_BASE = 104;
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1.0,
    }));
    corona.scale.set(CORONA_BASE, CORONA_BASE, 1);
    sunMesh.add(corona);

    // Outer halo — the big dramatic radiance. If we centered this on the Sun
    // at z=0, inner planets (Mercury/Venus/Earth) would orbit inside its
    // screen footprint while also crossing the Sun's depth plane, and the
    // depth test would flip the halo on/off over each planet twice per orbit
    // (the strobe the user was seeing). Instead we push the sprite ~700
    // units along the camera's view direction so its depth sits *behind*
    // every planet's orbit. With ortho projection this does not change its
    // screen position; the sprite still appears centered on the Sun, but the
    // depth test now reliably hides it behind any opaque surface (planets
    // and the Sun itself) and only reveals it in empty space — giving us
    // the big glow back without any strobing.
    const HALO_BASE = 460;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1.0,
    }));
    halo.scale.set(HALO_BASE, HALO_BASE, 1);
    const HALO_DEPTH_OFFSET = 700; // camera near=0.1 / far=4000; Neptune max depth ~1430
    const haloBackwardOffset = camera.position
      .clone()
      .negate()
      .normalize()
      .multiplyScalar(HALO_DEPTH_OFFSET);
    halo.position.copy(haloBackwardOffset);
    scene.add(halo);

    // Outer bloom sits slightly further behind — it's the very soft wash
    // that fades into the space around the Sun.
    const BLOOM_BASE = 720;
    const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bloomTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    }));
    bloom.scale.set(BLOOM_BASE, BLOOM_BASE, 1);
    const bloomBackwardOffset = camera.position
      .clone()
      .negate()
      .normalize()
      .multiplyScalar(HALO_DEPTH_OFFSET + 60);
    bloom.position.copy(bloomBackwardOffset);
    scene.add(bloom);

    // Invisible hit sphere for Sun hover
    const sunHit = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS * 1.25, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
    );
    sunHit.userData = { name: 'Sun', info: 'G-type main sequence · 4.6 billion years' };
    sunMesh.add(sunHit);

    // ─── Planets ──────────────────────────────────────────────────────────────
    const PLANETS: PlanetDef[] = [
      { name: 'Mercury', info: '88 day orbit · Closest to the Sun',
        texture: '/textures/4k_mercury.jpg',
        size: 4 * BODY_VISUAL_SCALE, orbitR: 75, period: 5.1, offset: 0.8,
        tilt: THREE.MathUtils.degToRad(0.03), spin: 0.08 },

      { name: 'Venus', info: '225 day orbit · Hottest planet',
        texture: '/textures/4k_venus_surface.jpg',
        size: 7 * BODY_VISUAL_SCALE, orbitR: 115, period: 12.9, offset: 2.1,
        tilt: THREE.MathUtils.degToRad(177), spin: -0.03 },

      { name: 'Earth', info: '365 day orbit · Our home',
        texture: '/textures/earthmap1k (1) (1).jpg',
        size: 9 * BODY_VISUAL_SCALE, orbitR: 160, period: 21.0, offset: 4.5,
        tilt: THREE.MathUtils.degToRad(23.4), spin: 0.14 },

      { name: 'Mars', info: '687 day orbit · The red planet',
        texture: '/textures/4k_mars.jpg',
        size: 6 * BODY_VISUAL_SCALE, orbitR: 210, period: 39.5, offset: 1.2,
        tilt: THREE.MathUtils.degToRad(25.2), spin: 0.18 },

      { name: 'Jupiter', info: '12 year orbit · Largest planet',
        texture: '/textures/4k_jupiter.jpg',
        size: 22 * BODY_VISUAL_SCALE, orbitR: 285, period: 125, offset: 3.7,
        tilt: THREE.MathUtils.degToRad(3.1), spin: 0.90 },

      { name: 'Saturn', info: '29 year orbit · Lord of the rings',
        texture: '/textures/4k_saturn.jpg',
        size: 18 * BODY_VISUAL_SCALE, orbitR: 350, period: 312, offset: 0.4,
        tilt: THREE.MathUtils.degToRad(26.7), spin: 0.82,
        hasRings: true },

      { name: 'Uranus', info: '84 year orbit · Tilted ice giant',
        texture: '/textures/2k_uranus.jpg',
        size: 12 * BODY_VISUAL_SCALE, orbitR: 395, period: 882, offset: 5.1,
        tilt: THREE.MathUtils.degToRad(97.8), spin: 0.45 },

      { name: 'Neptune', info: '165 year orbit · Farthest planet',
        texture: '/textures/2k_neptune.jpg',
        size: 11 * BODY_VISUAL_SCALE, orbitR: 435, period: 1725, offset: 2.8,
        tilt: THREE.MathUtils.degToRad(28.3), spin: 0.50 },
    ];

    const bodies: BodyRef[] = [];

    // Shared orbit line material (unlit, thin)
    const orbitMatBase = new THREE.LineBasicMaterial({
      color: 0xffebb4, transparent: true, opacity: 0.08, depthWrite: false,
    });
    const orbitMatHover = new THREE.LineBasicMaterial({
      color: 0xffebb4, transparent: true, opacity: 0.22, depthWrite: false,
    });

    function makeOrbitLine(radius: number): THREE.LineLoop {
      const segments = 256;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.LineLoop(geo, orbitMatBase);
    }

    function buildPlanet(def: PlanetDef): BodyRef {
      const orbitGroup = new THREE.Group();
      const tiltGroup  = new THREE.Group();
      tiltGroup.rotation.z = def.tilt;

      const tex = loadTex(def.texture);

      // Every planet uses the same PBR material so lighting is consistent.
      // Earth used to have a custom day/night shader + cloud sphere, but that
      // produced a hazy tint and a strobing day/night split at crescent
      // phase, so it now just uses the day texture like everyone else.
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 1,
        metalness: 0,
      });

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, 96, 96), mat);
      tiltGroup.add(mesh);

      // Saturn rings — use RingGeometry and remap UVs so the SSS ring strip
      // texture is sampled along the radial axis.
      if (def.hasRings) {
        const innerR = def.size * 1.25;
        const outerR = def.size * 2.30;
        const ringGeo = new THREE.RingGeometry(innerR, outerR, 256, 1);
        // Default RingGeometry is in the XY plane. We rotate it into XZ so
        // it lies in the planet's equatorial plane (tilted via tiltGroup).
        ringGeo.rotateX(-Math.PI / 2);
        // Remap UVs: radial position -> u, constant v.
        const pos = ringGeo.attributes.position;
        const uv  = ringGeo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const r = Math.sqrt(x * x + z * z);
          const u = (r - innerR) / (outerR - innerR);
          uv.setXY(i, u, 0.5);
        }
        const ringTex = loadTex('/textures/8k_saturn_ring_alpha.png');
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          alphaMap: ringTex,
          side: THREE.DoubleSide,
          depthWrite: false,
          alphaTest: 0.02,
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        tiltGroup.add(rings);
      }

      // Invisible larger hit mesh for easier hovering of small planets.
      const hitMesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(def.size * 1.8, def.size + 6), 16, 16),
        new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
      );
      hitMesh.userData = { name: def.name, info: def.info };
      mesh.add(hitMesh);

      orbitGroup.add(tiltGroup);
      scene.add(orbitGroup);

      const orbitLine = makeOrbitLine(def.orbitR);
      scene.add(orbitLine);

      return {
        name: def.name, info: def.info,
        orbitGroup, tiltGroup, mesh, hitMesh,
        orbitLine, spin: def.spin,
      };
    }

    PLANETS.forEach(def => bodies.push(buildPlanet(def)));
    const earthBody = bodies.find(b => b.name === 'Earth')!;

    // ─── Moon (orbits Earth) ──────────────────────────────────────────────────
    const MOON_ORBIT_R = 18;
    const MOON_SIZE = 2.4;
    const moonOrbitGroup = new THREE.Group();
    const moonTiltGroup  = new THREE.Group();
    moonTiltGroup.rotation.z = THREE.MathUtils.degToRad(6.7);
    const moonTex = loadTex('/textures/4k_moon.jpg');
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 1,
      metalness: 0,
    });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_SIZE, 64, 64), moonMat);
    moonTiltGroup.add(moonMesh);
    moonOrbitGroup.add(moonTiltGroup);
    earthBody.orbitGroup.add(moonOrbitGroup);

    const moonHit = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_SIZE * 3, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
    );
    moonHit.userData = { name: 'Moon', info: 'Earth’s natural satellite · 27.3 day orbit' };
    moonMesh.add(moonHit);

    // Moon orbit ring (dashed red-ish glow) around Earth.
    const moonOrbitPts: THREE.Vector3[] = [];
    const moonOrbitSegs = 96;
    for (let i = 0; i < moonOrbitSegs; i++) {
      const a = (i / moonOrbitSegs) * Math.PI * 2;
      moonOrbitPts.push(new THREE.Vector3(
        Math.cos(a) * MOON_ORBIT_R, 0, Math.sin(a) * MOON_ORBIT_R,
      ));
    }
    const moonOrbitGeo  = new THREE.BufferGeometry().setFromPoints(moonOrbitPts);
    const moonOrbitMat  = new THREE.LineBasicMaterial({
      color: 0xff6432, transparent: true, opacity: 0.22, depthWrite: false,
    });
    const moonOrbitLine = new THREE.LineLoop(moonOrbitGeo, moonOrbitMat);
    earthBody.orbitGroup.add(moonOrbitLine);

    // ─── Hover / raycasting ───────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitMeshes: THREE.Mesh[] = [
      sunHit,
      moonHit,
      ...bodies.map(b => b.hitMesh),
    ];

    let hoveredName: string | null = null;

    const tooltip = document.getElementById('planet-tooltip')!;
    const ttName  = document.getElementById('tt-name')!;
    const ttInfo  = document.getElementById('tt-info')!;

    function findBodyByName(name: string): BodyRef | null {
      return bodies.find(b => b.name === name) ?? null;
    }

    function setHoverState(name: string | null) {
      if (hoveredName === name) return;
      // Reset previous orbit line to base material
      if (hoveredName) {
        const prev = findBodyByName(hoveredName);
        if (prev?.orbitLine) prev.orbitLine.material = orbitMatBase;
      }
      hoveredName = name;
      if (name) {
        const cur = findBodyByName(name);
        if (cur?.orbitLine) cur.orbitLine.material = orbitMatHover;
      }
    }

    function pickHit(clientX: number, clientY: number) {
      const rect = oc.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { name: null as string | null, info: null as string | null };
      }

      ndc.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);

      let foundName: string | null = null;
      let foundInfo: string | null = null;
      if (hits.length > 0) {
        const hit = hits[0].object;
        foundName = (hit.userData.name as string) ?? null;
        foundInfo = (hit.userData.info as string) ?? null;
      }

      return { name: foundName, info: foundInfo };
    }

    function onMouseMove(e: MouseEvent) {
      const hit = pickHit(e.clientX, e.clientY);
      const foundName = hit.name;
      const foundInfo = hit.info;

      setHoverState(foundName);

      if (foundName && foundInfo) {
        oc.style.cursor = 'crosshair';
        ttName.textContent = foundName;
        ttInfo.textContent = foundInfo;
        tooltip.classList.add('visible');
        tooltip.style.left      = `${e.clientX + 16}px`;
        tooltip.style.top       = `${e.clientY}px`;
        tooltip.style.transform = 'translateY(-50%)';
      } else {
        oc.style.cursor = 'default';
        tooltip.classList.remove('visible');
      }
    }

    function onMouseLeave() {
      setHoverState(null);
      oc.style.cursor = 'default';
      tooltip.classList.remove('visible');
    }

    oc.addEventListener('mousemove', onMouseMove);
    oc.addEventListener('mouseleave', onMouseLeave);

    // ─── Render loop ──────────────────────────────────────────────────────────
    let rafId: number;
    const timer = new THREE.Timer();
    timer.connect(document);

    function bodyAngle(period: number, offset: number, t: number) {
      return offset + (t / period) * Math.PI * 2;
    }

    function frame() {
      const ts = performance.now();
      const t  = ts * 0.001;
      timer.update(ts);
      const dt = timer.getDelta();

      drawBg(ts);

      // Sun rotation & glow pulse — replaced the old single-sine pulse with
      // three non-commensurate sines per layer so the result never quite
      // repeats and reads as organic "breathing" rather than a metronome.
      // Each layer uses its own seed phase + slightly different frequency
      // set so corona / halo / bloom don't stay in phase with each other.
      sunMesh.rotation.y += dt * 0.05;

      // Corona: fastest-moving, tightest amplitude. Sits right at the
      // limb of the sun and tracks the "shimmer" of surface activity.
      const coronaPulse =
          0.55 * Math.sin(t * 0.42 + 1.3)
        + 0.30 * Math.sin(t * 0.97 + 2.4)
        + 0.15 * Math.sin(t * 1.83 + 0.7);
      corona.scale.setScalar(CORONA_BASE + coronaPulse * 6);
      corona.material.opacity = 0.92 + coronaPulse * 0.05;

      // Halo: medium cadence, slightly larger amplitude, offset phase so
      // it doesn't expand/contract in lockstep with the corona.
      const haloPulse =
          0.50 * Math.sin(t * 0.27 + 0.4)
        + 0.30 * Math.sin(t * 0.61 + 3.1)
        + 0.20 * Math.sin(t * 1.11 + 5.2);
      halo.scale.setScalar(HALO_BASE + haloPulse * 26);
      halo.material.opacity = 0.95 + haloPulse * 0.04;

      // Outer bloom: slowest, broadest — the "atmosphere" of the glow. Its
      // amplitude is larger in absolute terms but proportionally small
      // (~3% of its base scale) so it stays subtle.
      const bloomPulse =
          0.55 * Math.sin(t * 0.13 + 2.7)
        + 0.30 * Math.sin(t * 0.33 + 0.9)
        + 0.15 * Math.sin(t * 0.71 + 4.1);
      bloom.scale.setScalar(BLOOM_BASE + bloomPulse * 34);
      bloom.material.opacity = 0.85 + bloomPulse * 0.08;

      // Update planet positions, rotation, and shader uniforms.
      bodies.forEach(b => {
        const def = PLANETS.find(p => p.name === b.name)!;
        const a = bodyAngle(def.period, def.offset, t);
        b.orbitGroup.position.set(
          Math.cos(a) * def.orbitR, 0, Math.sin(a) * def.orbitR,
        );
        b.mesh.rotation.y += dt * b.spin;

      });

      // Moon orbit around Earth.
      const moonA = bodyAngle(0.72, 1.3, t);
      moonOrbitGroup.position.set(
        Math.cos(moonA) * MOON_ORBIT_R, 0, Math.sin(moonA) * MOON_ORBIT_R,
      );
      moonMesh.rotation.y += dt * 0.08;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }

    // ─── Resize ───────────────────────────────────────────────────────────────
    function onResize() {
      initBg();
      sizeRenderer();
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    initBg();
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
      oc.removeEventListener('mousemove', onMouseMove);
      oc.removeEventListener('mouseleave', onMouseLeave);

      loadedTextures.forEach(t => t.dispose());
      timer.dispose();
      scene.traverse(obj => {
        const anyObj = obj as unknown as {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (anyObj.geometry) anyObj.geometry.dispose();
        if (anyObj.material) {
          if (Array.isArray(anyObj.material)) {
            anyObj.material.forEach(m => m.dispose());
          } else {
            anyObj.material.dispose();
          }
        }
      });
      orbitMatBase.dispose();
      orbitMatHover.dispose();
      renderer.dispose();
    };
  }, []);

  const selectedEvent =
    events[selectedIndex] ?? events[0] ?? undefined;
  const title = titleLines(selectedEvent?.title ?? (isLoading ? 'Searching sky' : 'Quiet sky'));
  const startBoundary = formatBoundary(selectedEvent, 'start');
  const endBoundary = formatBoundary(selectedEvent, 'end');
  const eventDescription = queryError
    ? queryError
    : selectedEvent?.displayDescription ?? selectedEvent?.description ?? 'Scanning the next 7 days for visible events.';
  const directionLabel =
    selectedEvent?.localBestViewingDirectionLabel ??
    selectedEvent?.targetDirectionLabel ??
    'n/a';
  const altitudeValue =
    selectedEvent?.localBestViewingAltitudeDeg ??
    selectedEvent?.targetAltitudeDeg;
  const coolScore = formatScore(selectedEvent?.finalScore ?? selectedEvent?.coolScore);
  const ringCircumference = 213.6;
  const ringOffset = ringCircumference * (1 - coolScore / 100);

  return (
    <>
      <canvas id="bg" />
      <canvas id="orrery-canvas" />

      <div className="scene">
        <div className="info-left fade-in-2">
          <div className="event-meta">{currentTime ? formatCurrentDateTime(currentTime) : 'Loading local time'}</div>
          <div className="event-name-big">
            {title.lead}
            {title.accent ? <><br /><span className="event-name-accent">{title.accent}</span></> : null}
          </div>
          <p className="desc">
            {eventDescription}
          </p>
          <div className="time-range-block">
            <div className="time-block">
              <div className="time-value">{startBoundary.value}</div>
              <div className="time-label">{startBoundary.label}</div>
            </div>
            <div className="time-block">
              <div className="time-value">{endBoundary.value}</div>
              <div className="time-label">{endBoundary.label}</div>
            </div>
          </div>
          <div className="divider-short" />
        </div>

        <div className="info-right fade-in-3">
          <div className="eyebrow">Where to look</div>
          <div className="direction-data">
            <div className="dir-value">{directionLabel}</div>
            <div className="dir-label">Direction</div>
          </div>
          <div className="direction-data">
            <div className="dir-value">{formatAltitude(altitudeValue)}</div>
            <div className="dir-label">Above horizon</div>
          </div>
          <div className="score-ring-wrap">
            <div className="score-ring">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="rgba(255,235,180,0.07)"
                  strokeWidth="2"
                  suppressHydrationWarning
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#ff6633"
                  strokeWidth="2"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  suppressHydrationWarning
                />
              </svg>
              <div className="score-ring-num">{coolScore}</div>
            </div>
            <div className="score-ring-label">Cool score</div>
          </div>
        </div>
      </div>

      <SkyPanel
        forecastHours={forecastHours}
        events={events}
        solarTransitions={solarTransitions}
        selectedEvent={selectedEvent}
        onSelectEvent={(event) => {
          const idx = events.findIndex(e => e.id === event.id);
          if (idx >= 0) setSelectedIndex(idx);
        }}
      />

      <div id="planet-tooltip">
        <div className="tt-name" id="tt-name" />
        <div className="tt-info" id="tt-info" />
      </div>

    </>
  );
}
