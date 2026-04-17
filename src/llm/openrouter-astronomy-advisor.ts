import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { OpenRouterClient } from "../providers/llm/openRouter.js";
import type {
  AstronomyAdvisor,
  AstronomyNarration,
  LocationDecision,
  ReachablePlaceOption
} from "./astronomy-advisor.js";

const buildViewingNotes = (
  event: ScoredAstronomyEvent,
  selectedPlace?: ReachablePlaceOption
): string => {
  const notes = [
    event.instructionText,
    event.visibility.horizonSensitive ? "Low-altitude event; clear horizon matters." : undefined,
    selectedPlace ? `${selectedPlace.travelTimeMinutes} minute drive.` : undefined
  ].filter((value): value is string => Boolean(value));

  return notes.join(" ");
};

export class OpenRouterAstronomyAdvisor implements AstronomyAdvisor {
  public constructor(private readonly client: OpenRouterClient) {}

  public async chooseLocation(input: {
    observer: { latitude: number; longitude: number; elevationM?: number };
    event: ScoredAstronomyEvent;
    candidatePlaces: ReachablePlaceOption[];
  }): Promise<LocationDecision> {
    const result = await this.client.chooseBestLocation({
      eventTitle: input.event.title,
      eventDescription: input.event.description,
      maxDriveMinutes:
        Math.max(...input.candidatePlaces.map((place) => place.travelTimeMinutes), 0),
      candidates: input.candidatePlaces.map((place) => ({
        id: place.id,
        name: place.name,
        travelTimeMinutes: place.travelTimeMinutes,
        distanceMeters: place.distanceMeters,
        directionLabel: input.event.targetDirectionLabel,
        opennessScore: undefined,
        notes: `${place.placeType}`
      }))
    });

    return {
      selectedPlaceId: result.chosenLocationId,
      rationale: result.reason
    };
  }

  public async describeEvent(input: {
    observer: { latitude: number; longitude: number; elevationM?: number };
    event: ScoredAstronomyEvent;
    selectedPlace?: ReachablePlaceOption;
  }): Promise<AstronomyNarration> {
    const shortDescription = await this.client.generateEventDescription({
      eventTitle: input.event.title,
      eventSummary: input.event.description,
      locationName: input.selectedPlace?.name ?? input.event.recommendedPlaceName ?? "your area",
      directionHint: input.event.targetDirectionLabel,
      viewingNotes: buildViewingNotes(input.event, input.selectedPlace)
    });

    return {
      shortDescription,
      whyItMatters: input.event.title,
      viewingAdvice: input.event.instructionText ?? "Check the sky conditions before heading out."
    };
  }
}
