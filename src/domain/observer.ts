export interface ObserverContext {
  latitude: number;
  longitude: number;
  elevationM?: number;
  timezoneOffsetMinutes?: number;
  locationLabel?: string;
  snapshotTime?: Date;
  liveAnchorTime?: Date;
  calendarAnchorTime?: Date;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface RecommendationRequest {
  observer: ObserverContext;
  timeRange: TimeRange;
  includeSuppressed?: boolean;
  maxResults?: number;
}
