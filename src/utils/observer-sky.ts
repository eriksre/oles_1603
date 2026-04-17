import { createRequire } from "node:module";
import type * as AstronomyEngine from "astronomy-engine";

import type { ObserverContext } from "../domain/observer.js";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof AstronomyEngine;

const { Body, Equator, Horizon, Illumination, Observer } = Astronomy;

type AstronomyObserver = InstanceType<typeof Observer>;

const toObserver = (observer: ObserverContext): AstronomyObserver =>
  new Observer(observer.latitude, observer.longitude, observer.elevationM ?? 0);

const normalizeDegrees = (degrees: number): number => {
  const normalized = degrees % 360;
  return normalized >= 0 ? normalized : normalized + 360;
};

function getBodyAltitude(
  body: typeof Body.Sun | typeof Body.Moon,
  time: Date,
  observer: ObserverContext
): number {
  const astroObserver = toObserver(observer);
  const eq = Equator(body, time, astroObserver, true, true);
  const hor = Horizon(time, astroObserver, eq.ra, eq.dec, "normal");

  return hor.altitude;
}

export function getLocalSkyContext(time: Date, observer: ObserverContext) {
  return {
    sunAltitudeDeg: getBodyAltitude(Body.Sun, time, observer),
    moonAltitudeDeg: getBodyAltitude(Body.Moon, time, observer),
    moonIllumination: Illumination(Body.Moon, time).phase_fraction
  };
}

export { normalizeDegrees };
