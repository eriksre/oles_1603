export interface RawVisibilityEvent {
  targetAltitudeDeg?: number;
}

export interface RawVisibilityObserver {
  lat: number;
  lon: number;
  elevationM?: number;
  timeIso?: string;
}

export interface AstronomicalVisibilityResult {
  visible: boolean;
  horizonSensitive: boolean;
  classification: "below_horizon" | "horizon_sensitive" | "visible";
  reasons: string[];
}

export function classifyAstronomicalVisibility(input: {
  event: RawVisibilityEvent;
  observer: RawVisibilityObserver;
}): AstronomicalVisibilityResult {
  const altitude = input.event.targetAltitudeDeg;

  if (altitude !== undefined && altitude <= 0) {
    return {
      visible: false,
      horizonSensitive: false,
      classification: "below_horizon",
      reasons: ["target altitude is at or below the horizon"]
    };
  }

  if (altitude !== undefined && altitude < 10) {
    return {
      visible: true,
      horizonSensitive: true,
      classification: "horizon_sensitive",
      reasons: ["target altitude is low enough to be horizon sensitive"]
    };
  }

  return {
    visible: true,
    horizonSensitive: false,
    classification: "visible",
    reasons: []
  };
}
