const CARDINAL_LABELS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW"
] as const;

const NORMALIZED_DEGREES = 360;
const CARDINAL_SEGMENT = NORMALIZED_DEGREES / CARDINAL_LABELS.length;

export const normalizeDegrees = (degrees: number): number => {
  const normalized = degrees % NORMALIZED_DEGREES;
  return normalized >= 0 ? normalized : normalized + NORMALIZED_DEGREES;
};

export const azimuthToDirectionLabel = (degrees: number): string => {
  const normalized = normalizeDegrees(degrees);
  const index = Math.round(normalized / CARDINAL_SEGMENT) % CARDINAL_LABELS.length;

  return CARDINAL_LABELS[index];
};

export const azimuthSpanToDirectionSummary = (
  startDegrees: number,
  endDegrees: number
): string => `${azimuthToDirectionLabel(startDegrees)} through ${azimuthToDirectionLabel(endDegrees)}`;
