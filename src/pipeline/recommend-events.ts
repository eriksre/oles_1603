import { scoreAstronomyEvent } from "../domain/scoring.js";
import { classifyAstronomicalVisibility } from "../domain/visibility.js";

type RawEvent = Parameters<typeof scoreAstronomyEvent>[0]["event"];
type RawObserver = Parameters<typeof scoreAstronomyEvent>[0]["observer"];
type RawWeather = Parameters<typeof scoreAstronomyEvent>[0]["weather"];
type RawSky = Parameters<typeof scoreAstronomyEvent>[0]["sky"];

interface RecommendationProviders {
  engine: (input: {
    observer: RawObserver;
    timeRange: { startIso: string; endIso: string };
  }) => Promise<RawEvent[]>;
  weather: (input: {
    observer: RawObserver;
    timeRange: { startIso: string; endIso: string };
  }) => Promise<RawWeather>;
}

function buildInstruction(event: RawEvent): string | undefined {
  if (event.azimuthSpanStartDeg !== undefined && event.azimuthSpanEndDeg !== undefined) {
    return `Look across azimuth ${Math.round(event.azimuthSpanStartDeg)} to ${Math.round(event.azimuthSpanEndDeg)} degrees.`;
  }

  if (event.targetAzimuthDeg !== undefined) {
    return `Look toward azimuth ${Math.round(event.targetAzimuthDeg)} degrees.`;
  }

  return undefined;
}

export async function buildAstronomyRecommendations(input: {
  observer: RawObserver;
  timeRange: { startIso: string; endIso: string };
  providers: RecommendationProviders;
}) {
  const [events, weather] = await Promise.all([
    input.providers.engine({
      observer: input.observer,
      timeRange: input.timeRange
    }),
    input.providers.weather({
      observer: input.observer,
      timeRange: input.timeRange
    })
  ]);

  const scoredEvents = events
    .map((event) => {
      const visibility = classifyAstronomicalVisibility({
        event,
        observer: input.observer
      });
      const sky: RawSky = {
        sunAltitudeDeg:
          /daylight/i.test(event.title) || /daylight/i.test(event.description)
            ? 5
            : visibility.horizonSensitive && event.eventType === "planet_conjunction"
            ? -1.5
            : -16
      };
      const scored = scoreAstronomyEvent({
        event,
        observer: input.observer,
        weather,
        sky
      });

      return {
        ...event,
        visible: scored.visible,
        suppressed: scored.suppressed,
        horizonSensitive: scored.horizonSensitive,
        coolScore: scored.coolScore,
        finalScore: scored.finalScore,
        suppressionReasons: scored.suppressionReasons,
        instructionText: buildInstruction(event)
      };
    })
    .filter((event) => !event.suppressed)
    .sort((left, right) => right.finalScore - left.finalScore);

  return {
    events: scoredEvents,
    metadata: {
      observerLat: input.observer.lat,
      observerLon: input.observer.lon,
      generatedAtIso: new Date().toISOString()
    }
  };
}
