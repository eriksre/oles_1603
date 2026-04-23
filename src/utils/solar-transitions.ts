import { createRequire } from "node:module";
import type * as AstronomyEngine from "astronomy-engine";

import type { ObserverContext, TimeRange } from "../domain/observer.js";
import { MINUTE_MS } from "./stability.js";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof AstronomyEngine;

const { Body, Observer, SearchAltitude } = Astronomy;

type AstronomyObserver = InstanceType<typeof Observer>;

const SUN_TRANSITION_ALTITUDE_DEG = -0.833;
const SEARCH_LIMIT_DAYS = 2;

export interface SolarTransition {
  kind: "sunrise" | "sunset";
  timeUtc: string;
}

function toObserver(observer: ObserverContext): AstronomyObserver {
  return new Observer(
    observer.latitude,
    observer.longitude,
    observer.elevationM ?? 0
  );
}

function findTransitionsForKind(
  observer: ObserverContext,
  timeRange: TimeRange,
  kind: SolarTransition["kind"]
): SolarTransition[] {
  const astroObserver = toObserver(observer);
  const direction = kind === "sunrise" ? +1 : -1;
  const transitions: SolarTransition[] = [];
  let cursor = new Date(timeRange.start);

  while (cursor.getTime() <= timeRange.end.getTime()) {
    const result = SearchAltitude(
      Body.Sun,
      astroObserver,
      direction,
      cursor,
      SEARCH_LIMIT_DAYS,
      SUN_TRANSITION_ALTITUDE_DEG
    );

    if (!result) {
      break;
    }

    const eventTime = result.date;

    if (eventTime.getTime() > timeRange.end.getTime()) {
      break;
    }

    if (eventTime.getTime() >= timeRange.start.getTime()) {
      transitions.push({
        kind,
        timeUtc: eventTime.toISOString()
      });
    }

    cursor = new Date(eventTime.getTime() + MINUTE_MS);
  }

  return transitions;
}

export function getSolarTransitions(
  observer: ObserverContext,
  timeRange: TimeRange
): SolarTransition[] {
  return [
    ...findTransitionsForKind(observer, timeRange, "sunrise"),
    ...findTransitionsForKind(observer, timeRange, "sunset")
  ].sort(
    (left, right) =>
      new Date(left.timeUtc).getTime() - new Date(right.timeUtc).getTime()
  );
}
