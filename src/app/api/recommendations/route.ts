import { NextResponse } from "next/server";

import { EventsApi } from "../../../api/events-api.js";
import { CompositeEventSource } from "../../../engine/composite-event-source.js";
import { AuroraEventSource } from "../../../engine/aurora-event-source.js";
import { IssPassEventSource } from "../../../engine/iss-pass-event-source.js";
import { MeteorShowerEventSource } from "../../../engine/meteor-shower-event-source.js";
import { OpenRouterAstronomyAdvisor } from "../../../llm/openrouter-astronomy-advisor.js";
import { LocalAstronomyEventSource } from "../../../providers/astronomy/localAstronomyEventSource.js";
import { OpenRouterClient } from "../../../providers/llm/openRouter.js";
import { OpenMeteoWeatherProvider } from "../../../providers/weather/openMeteo.js";
import { getSolarTransitions } from "../../../utils/solar-transitions.js";
import {
  DAY_MS,
  MINUTE_MS,
  floorDateToInterval,
  roundCoordinate,
  startOfObserverLocalDay
} from "../../../utils/stability.js";

export const runtime = "nodejs";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 14;
const DEFAULT_MAX_RESULTS = 6;
const LIVE_SNAPSHOT_INTERVAL_MS = 15 * MINUTE_MS;

interface RecommendationBody {
  latitude?: unknown;
  longitude?: unknown;
  elevationM?: unknown;
  locationLabel?: unknown;
  days?: unknown;
  maxResults?: unknown;
  timezoneOffsetMinutes?: unknown;
}

const toFiniteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : undefined;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const buildEventsApi = () => {
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  return new EventsApi({
    eventSource: new CompositeEventSource(
      [
        new LocalAstronomyEventSource(),
        new MeteorShowerEventSource(),
        new AuroraEventSource(),
        new IssPassEventSource()
      ],
      { continueOnSourceError: true }
    ),
    weatherProvider: new OpenMeteoWeatherProvider({
      baseUrl: process.env.OPEN_METEO_BASE_URL
    }),
    astronomyAdvisor: openRouterKey
      ? new OpenRouterAstronomyAdvisor(new OpenRouterClient())
      : undefined
  });
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationBody;
    const latitude = toFiniteNumber(body.latitude);
    const longitude = toFiniteNumber(body.longitude);

    if (
      latitude === undefined ||
      longitude === undefined ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: "Enter a valid latitude and longitude." },
        { status: 400 }
      );
    }

    const days = clamp(
      Math.round(toFiniteNumber(body.days) ?? DEFAULT_DAYS),
      1,
      MAX_DAYS
    );
    const maxResults = clamp(
      Math.round(toFiniteNumber(body.maxResults) ?? DEFAULT_MAX_RESULTS),
      1,
      12
    );
    const roundedLatitude = roundCoordinate(latitude, 3);
    const roundedLongitude = roundCoordinate(longitude, 3);
    const timezoneOffsetMinutes = toFiniteNumber(body.timezoneOffsetMinutes) ?? 0;
    const snapshotAt = new Date();
    const liveAnchor = floorDateToInterval(snapshotAt, LIVE_SNAPSHOT_INTERVAL_MS);
    const calendarAnchor = startOfObserverLocalDay(
      liveAnchor,
      timezoneOffsetMinutes
    );
    const start = calendarAnchor;
    const end = new Date(start.getTime() + days * DAY_MS);
    const api = buildEventsApi();

    const recommendations = await api.getRecommendationsBundle({
      observer: {
        latitude: roundedLatitude,
        longitude: roundedLongitude,
        elevationM: toFiniteNumber(body.elevationM),
        locationLabel: toOptionalString(body.locationLabel),
        timezoneOffsetMinutes,
        snapshotTime: snapshotAt,
        liveAnchorTime: liveAnchor,
        calendarAnchorTime: calendarAnchor
      },
      timeRange: { start, end },
      maxResults
    });
    const solarTransitions = getSolarTransitions(
      {
        latitude: roundedLatitude,
        longitude: roundedLongitude,
        elevationM: toFiniteNumber(body.elevationM)
      },
      { start, end }
    );

    return NextResponse.json({
      events: recommendations.events,
      solarTransitions,
      forecast: recommendations.forecast
        ? {
            provider: recommendations.forecast.provider,
            timezone: recommendations.forecast.timezone,
            hours: recommendations.forecast.hours.map((hour) => ({
              timeUtc: hour.timeUtc,
              cloudCoverPct: hour.cloudCoverPct,
              cloudCoverLowPct: hour.cloudCoverLowPct,
              cloudCoverMidPct: hour.cloudCoverMidPct,
              cloudCoverHighPct: hour.cloudCoverHighPct,
              precipitationProbabilityPct: hour.precipitationProbabilityPct,
              visibilityKm: hour.visibilityKm,
              windSpeedKph: hour.windSpeedKph,
              temperatureC: hour.temperatureC
            }))
          }
        : undefined,
      metadata: {
        generatedAt: snapshotAt.toISOString(),
        start: start.toISOString(),
        end: end.toISOString(),
        snapshotAt: snapshotAt.toISOString(),
        liveAnchor: liveAnchor.toISOString(),
        calendarAnchor: calendarAnchor.toISOString(),
        locationLabel: toOptionalString(body.locationLabel),
        advisorProvider: process.env.OPENROUTER_API_KEY
          ? process.env.OPENROUTER_MODEL ?? "openai/gpt-5.4-mini"
          : "off"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build recommendations.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
