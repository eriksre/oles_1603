export * from "./domain/events.js";
export * from "./domain/observer.js";
export * from "./domain/places.js";
export * from "./domain/visibility.js";
export { scoreAstronomyEvent as scoreAstronomyEventForCompatibility } from "./domain/scoring.js";
export * from "./engine/contracts.js";
export * from "./engine/composite-event-source.js";
export * from "./engine/meteor-shower-event-source.js";
export * from "./pipeline/recommendation-service.js";
export * from "./pipeline/recommend-events.js";
export * from "./pipeline/normalize-event.js";
export {
  OpenMeteoWeatherProvider,
  buildOpenMeteoForecastUrl,
  normalizeOpenMeteoForecast
} from "./providers/weather/openMeteo.js";
export type {
  Coordinates,
  GeocodeResult,
  GeocodingProvider,
  PlaceSearchProvider,
  PlaceSearchQuery,
  RouteEstimate,
  RouteQuery,
  RoutingProvider,
  WeatherForecast,
  WeatherForecastHour,
  WeatherForecastQuery,
  WeatherProvider
} from "./providers/types.js";
export {
  buildScoreBreakdown,
  calculateCoolScore,
  calculateFinalScore,
  scoreAstronomyEvent
} from "./scoring/cool-score.js";
export * from "./scoring/visibility.js";
export * from "./data/index.js";
export * from "./utils/direction.js";
