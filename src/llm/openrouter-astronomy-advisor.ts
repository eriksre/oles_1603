import type { ScoredAstronomyEvent } from "../domain/events.js";
import type { OpenRouterClient } from "../providers/llm/openRouter.js";
import type { AstronomyAdvisor, AstronomyNarration } from "./astronomy-advisor.js";

const buildViewingNotes = (event: ScoredAstronomyEvent): string => {
  const notes = [
    event.instructionText,
    event.visibility.horizonSensitive ? "Low-altitude event; clear horizon matters." : undefined
  ].filter((value): value is string => Boolean(value));

  return notes.join(" ");
};

export class OpenRouterAstronomyAdvisor implements AstronomyAdvisor {
  public constructor(private readonly client: OpenRouterClient) {}

  public async describeEvent(input: {
    observer: { latitude: number; longitude: number; elevationM?: number };
    event: ScoredAstronomyEvent;
  }): Promise<AstronomyNarration> {
    const shortDescription = await this.client.generateEventDescription({
      eventTitle: input.event.title,
      eventSummary: input.event.description,
      locationName: "your area",
      directionHint: input.event.targetDirectionLabel,
      viewingNotes: buildViewingNotes(input.event)
    });

    return {
      shortDescription,
      whyItMatters: input.event.title,
      viewingAdvice: input.event.instructionText ?? "Check the sky conditions before heading out."
    };
  }
}
