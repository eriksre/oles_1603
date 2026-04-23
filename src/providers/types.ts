export interface Coordinates {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface TimeRange {
  startUtc: string;
  endUtc: string;
  timezone?: string;
}

export interface WeatherForecastQuery extends Coordinates {
  startUtc: string;
  endUtc: string;
  timezone?: string;
}

export interface WeatherForecastHour {
  timeUtc: string;
  cloudCoverPct?: number;
  cloudCoverLowPct?: number;
  cloudCoverMidPct?: number;
  cloudCoverHighPct?: number;
  visibilityKm?: number;
  precipitationProbabilityPct?: number;
  windSpeedKph?: number;
  temperatureC?: number;
}

export interface WeatherForecast {
  provider: string;
  latitude: number;
  longitude: number;
  timezone: string;
  hours: WeatherForecastHour[];
  raw?: unknown;
}

export interface WeatherProvider {
  readonly name: string;
  getForecast(query: WeatherForecastQuery): Promise<WeatherForecast>;
}
