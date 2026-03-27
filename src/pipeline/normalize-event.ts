import type { AstronomyEventCandidate } from "../domain/events.js";
import { azimuthSpanToDirectionSummary, azimuthToDirectionLabel } from "../utils/direction.js";

const buildInstructionText = (event: AstronomyEventCandidate): string | undefined => {
  if (event.instructionText) {
    return event.instructionText;
  }

  if (event.targetDirectionLabel && event.targetAltitudeDeg !== undefined) {
    return `Look ${event.targetDirectionLabel}, about ${Math.round(event.targetAltitudeDeg)} deg above the horizon.`;
  }

  if (event.targetDirectionLabel) {
    return `Look ${event.targetDirectionLabel} to catch the event.`;
  }

  if (event.azimuthSpanStartDeg !== undefined && event.azimuthSpanEndDeg !== undefined) {
    return `Scan the sky from ${azimuthSpanToDirectionSummary(
      event.azimuthSpanStartDeg,
      event.azimuthSpanEndDeg
    )}.`;
  }

  return undefined;
};

export const normalizeEventCandidate = (
  event: AstronomyEventCandidate
): AstronomyEventCandidate => {
  const targetDirectionLabel =
    event.targetDirectionLabel ??
    (event.targetAzimuthDeg !== undefined
      ? azimuthToDirectionLabel(event.targetAzimuthDeg)
      : event.azimuthSpanStartDeg !== undefined && event.azimuthSpanEndDeg !== undefined
        ? azimuthSpanToDirectionSummary(event.azimuthSpanStartDeg, event.azimuthSpanEndDeg)
        : undefined);

  return {
    ...event,
    targetDirectionLabel,
    instructionText: buildInstructionText({
      ...event,
      targetDirectionLabel
    })
  };
};
