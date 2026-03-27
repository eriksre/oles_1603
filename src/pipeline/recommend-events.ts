import { scoreAstronomyEvent } from "../domain/scoring.js";
import { classifyAstronomicalVisibility } from "../domain/visibility.js";

type RawEvent = Parameters<typeof scoreAstronomyEvent>[0]["event"];
type RawObserver = Parameters<typeof scoreAstronomyEvent>[0]["observer"];
type RawWeather = Parameters<typeof scoreAstronomyEvent>[0]["weather"];
type RawPlace = Parameters<typeof scoreAstronomyEvent>[0]["place"];
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
  places: (input: {
    observer: RawObserver;
    timeRange: { startIso: string; endIso: string };
  }) => Promise<RawPlace[]>;
}

function scorePlace(event: RawEvent, place: RawPlace): number {
  const opennessWeight =
    event.eventType === "planet_parade" || (event.targetAltitudeDeg ?? 20) < 12
      ? 0.55
      : 0.35;
  const darknessWeight =
    event.eventType === "meteor_shower" || event.eventType === "aurora" ? 0.35 : 0.15;
  const travelWeight = 0.25;

  return (
    place.openHorizonScore * opennessWeight +
    place.darkSkyScore * darknessWeight +
    Math.max(10, 100 - place.travelTimeMinutes * 3) * travelWeight
  );
}

function buildInstruction(event: RawEvent, place: RawPlace): string {
  if (event.azimuthSpanStartDeg !== undefined && event.azimuthSpanEndDeg !== undefined) {
    return `Look across azimuth ${Math.round(event.azimuthSpanStartDeg)} to ${Math.round(event.azimuthSpanEndDeg)} degrees from ${place.name}.`;
  }

  if (event.targetAzimuthDeg !== undefined) {
    return `Look toward azimuth ${Math.round(event.targetAzimuthDeg)} degrees from ${place.name}.`;
  }

  return `Look from ${place.name} for the clearest view.`;
}

export async function buildAstronomyRecommendations(input: {
  observer: RawObserver;
  timeRange: { startIso: string; endIso: string };
  providers: RecommendationProviders;
}) {
  const [events, weather, places] = await Promise.all([
    input.providers.engine({
      observer: input.observer,
      timeRange: input.timeRange
    }),
    input.providers.weather({
      observer: input.observer,
      timeRange: input.timeRange
    }),
    input.providers.places({
      observer: input.observer,
      timeRange: input.timeRange
    })
  ]);

  const scoredEvents = events
    .map((event) => {
      const bestPlace = [...places].sort(
        (left, right) => scorePlace(event, right) - scorePlace(event, left)
      )[0];
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
        place:
          bestPlace ??
          ({
            id: "fallback",
            name: input.observer.timeIso,
            lat: input.observer.lat,
            lon: input.observer.lon,
            elevationM: input.observer.elevationM,
            distanceM: 0,
            travelTimeMinutes: 0,
            placeType: "viewpoint",
            openHorizonScore: 50,
            darkSkyScore: 50
          } satisfies RawPlace),
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
        recommendedPlaceName: bestPlace?.name,
        instructionText: bestPlace ? buildInstruction(event, bestPlace) : undefined
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
