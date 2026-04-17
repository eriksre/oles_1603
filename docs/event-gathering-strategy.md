# Event Gathering Strategy

## Scope

This document covers only how to gather and derive astronomy event candidates for a user-supplied Earth location.

Input:

- latitude
- longitude
- optional elevation
- time range, usually "now through the next 30-90 days"

Output:

- a list of event candidates with start, peak, end, source, confidence, and observer geometry

## Recommendation

Use a composite event source with three event-gathering inputs:

1. Local ephemeris calculations for deterministic Sun, Moon, and planet events.
2. Curated annual calendars for meteor showers.
3. Live/near-live feeds for aurora and ISS passes.

Do not build the product around a single "astronomy events" feed. That source does not exist in a clean, complete, location-aware form.

## User-Facing Event Policy

The product should recommend events that a normal person can experience by going outside and looking up. We can derive or fetch more astronomy facts internally later, but the default user-facing catalog should stay tight.

Show by default:

- `solar_eclipse`
- `lunar_eclipse`, total and partial only
- `meteor_shower`
- `iss_pass`
- `aurora`
- `moon_planet_close_approach`
- `planetary_conjunction`
- `planet_parade`
- `venus_best_visibility`
- `mercury_best_visibility`
- `supermoon`

Show conditionally:

- `full_moon`, only when it has a stronger hook such as supermoon, eclipse, unusually good moonrise timing, or a scenic local viewing angle
- `planet_opposition`, only for Mars, Jupiter, and Saturn
- Venus peak-brightness windows, emitted as `venus_best_visibility`, unless they duplicate an existing Venus best-visibility event

Do not add event types just because a source can produce them. A candidate needs a visible object, a useful local time, and a simple viewing instruction.

## Source Material Categories

This is the implementation map. Each category should become one event-source adapter that emits canonical `AstronomyEventCandidate` objects. The aggregator should not know how the source works; it should only call `generateEvents(observer, timeRange)`.

| Source material category | Adapter | Event types | Source type |
| --- | --- | --- | --- |
| Local major-body ephemeris | `AstronomyEngineEventSource` | `full_moon`, `supermoon`, `lunar_eclipse`, `solar_eclipse`, `moon_planet_close_approach`, `planetary_conjunction`, `planet_opposition`, `mercury_best_visibility`, `venus_best_visibility`, `planet_parade` | `derived` |
| Curated meteor-shower catalog | `MeteorShowerEventSource` | `meteor_shower` | `curated` |
| NOAA space-weather products | `AuroraEventSource` | `aurora` | `live` |
| ISS orbital elements / ephemeris files | `IssPassEventSource` | `iss_pass` | `live` |
| Official reference/validation material | no runtime adapter by default | reference tests and spot checks only | n/a |

The MVP should aggregate these sources in this order:

1. `AstronomyEngineEventSource`
2. `MeteorShowerEventSource`
3. `AuroraEventSource`
4. `IssPassEventSource`

## Aggregation Model

The repo already has the correct shape for aggregation:

- `src/engine/contracts.ts` defines `AstronomyEventSource`.
- `src/engine/composite-event-source.ts` combines multiple event sources.
- `src/domain/events.ts` defines the canonical event candidate shape.

The target composition should look conceptually like this:

```ts
const eventSource = new CompositeEventSource([
  new AstronomyEngineEventSource(),
  new MeteorShowerEventSource(),
  new AuroraEventSource(swpcClient),
  new IssPassEventSource({ celestrakClient, sgp4 })
]);
```

Each adapter is responsible for:

- fetching or deriving events from its own source material
- projecting candidates to the observer when the event is location-sensitive
- setting `sourceType`, `sourceName`, and `confidence`
- returning normalized `AstronomyEventCandidate[]`

The aggregator is responsible only for:

- calling all adapters
- flattening results
- de-duplicating if two adapters produce the same event
- sorting by `peakTime`

It should not contain source-specific astronomy logic.

## Query Tools

Each implemented source should have a direct query command, and the aggregate should have its own command.

Current commands:

- `npm run events:all -- --date 2026-08-01 --days 45 --lat -33.8688 --lon 151.2093`
- `npm run events:local -- --date 2024-12-01 --days 15 --lat -33.8688 --lon 151.2093 --types planet_opposition`
- `npm run events:meteor -- --date 2026-08-01 --days 45 --lat -33.8688 --lon 151.2093`

When new sources are implemented, add one source-specific command and include that source in `events:all`.

## Source Material Event Map

### 1. Local Major-Body Ephemeris

Source material:

- Astronomy Engine locally
- JPL Horizons for reference validation

Events generated:

| Event | How to derive | Location-specific part |
| --- | --- | --- |
| Full moon | `SearchMoonQuarter` where `quarter === 2` | best local Moon viewing time |
| Supermoon | full moon plus nearest `SearchLunarApsis` perigee | best local Moon viewing time |
| Lunar eclipse | `SearchLunarEclipse` / `NextLunarEclipse` | Moon altitude during eclipse phases |
| Solar eclipse | `SearchLocalSolarEclipse` / `NextLocalSolarEclipse` | fully local event |
| Moon-planet close approach | topocentric angular separation scan and refinement | fully topocentric, especially for Moon parallax |
| Planet-planet close approach | angular separation scan and refinement | local horizon/twilight |
| Planet opposition | `SearchRelativeLongitude` for Mars, Jupiter, and Saturn | local best time, usually near midnight |
| Mercury/Venus elongation | `SearchMaxElongation` | local twilight and horizon |
| Venus peak brightness | `SearchPeakMagnitude(Body.Venus)` | local twilight and horizon |
| Planet parade | sample local sky and cluster multi-planet visibility windows | fully observer-specific |

Adapter:

- Keep and extend `AstronomyEngineEventSource`.

Implementation notes:

- This bucket should not make external network calls.
- Add reference tests against JPL Horizons/USNO/NASA for known events.

### 2. Curated Meteor-Shower Catalog

Source material:

- IMO annual meteor shower calendar
- AMS meteor shower calendar
- NASA meteor shower overview pages as secondary reference

Events generated:

| Event | How to derive | Location-specific part |
| --- | --- | --- |
| Meteor shower peak | reviewed yearly catalog occurrence | radiant altitude during local dark hours |
| Strong active shower night | optional later expansion from active date range | radiant altitude and local date |

Adapter:

- Continue using `MeteorShowerEventSource`.

Implementation notes:

- The catalog stores radiant RA/Dec, peak UTC overrides, ZHR, velocity, parent body, source URL, and review status.
- The adapter generates local best viewing geometry from radiant coordinates instead of returning only a global calendar item.
- The adapter emits a shower only when the radiant is above the observer horizon during a dark local window in the requested time range.
- Keep reviewing yearly peak timing and moonlight notes before each shower season.

### 3. NOAA Space-Weather Products

Source material:

- NOAA SWPC Aurora 30-Minute Forecast
- NOAA SWPC Aurora Viewline for Tonight and Tomorrow Night
- NASA DONKI only as supporting context for CMEs, GSTs, and flares

Events generated:

| Event | How to derive | Location-specific part |
| --- | --- | --- |
| Aurora opportunity | user location intersects or nears NOAA forecast/viewline | fully local |
| Aurora watch | DONKI/NOAA storm context suggests possible later aurora | local by hemisphere/latitude, lower confidence |

Adapter:

- Add `AuroraEventSource`.

Implementation notes:

- Treat aurora as a live/short-range source, not a long calendar source.
- Use NOAA as the visibility source of truth.
- Use DONKI for event explanation/context only after a local aurora opportunity exists or a watch threshold is met.

### 4. ISS Orbital Elements / Ephemeris Files

Source material:

- CelesTrak GP data, preferably OMM JSON
- NASA Spot the Station ISS Orbit Ephemeris Message as optional ISS-specific source

Events generated:

| Event | How to derive | Location-specific part |
| --- | --- | --- |
| ISS pass | propagate ISS orbit and find visible observer passes | fully local |

Adapter:

- Add `IssPassEventSource`.

Implementation notes:

- Add a maintained SGP4 library for CelesTrak TLE/OMM data.
- A pass is a user event only if the satellite is above the horizon, sunlit, and the observer sky is dark enough.

### 5. Reference / Validation Material

Source material:

- JPL Horizons
- USNO Astronomical Applications API
- NASA eclipse pages

Events generated:

- None by default.

Adapter:

- No runtime adapter for MVP.

Implementation notes:

- Use these sources for tests, audits, and source-of-truth comparisons.
- Do not call JPL Horizons at high volume from normal user requests. JPL's SSD APIs publish fair-use guidance and should be used carefully.

## Source Fit

| Source | Use | Runtime role |
| --- | --- | --- |
| Astronomy Engine | Primary local calculation engine for major-body events | Main MVP source |
| JPL Horizons | Authoritative ephemeris source for spot-checking local calculations | Validation/reference |
| USNO Astronomical Applications API | Moon phase, Sun/Moon daily data, and solar eclipse year lists | Validation/reference, not main event feed |
| NASA eclipse pages | Official eclipse reference and public-facing validation | Reference |
| IMO / AMS meteor calendars | Annual meteor shower peak/activity data | Curated catalog input |
| NOAA SWPC OVATION / viewline | Aurora nowcast and short forecast | Live event source |
| NASA DONKI | Space-weather event context, especially CME/GST/flare events | Trigger/context source for aurora |
| NASA Spot the Station ISS trajectory data | Official ISS trajectory reference | Optional ISS source |
| CelesTrak GP/OMM data | ISS orbital elements in TLE/OMM/JSON/CSV | Primary ISS-pass source |

## Shared Pipeline

Every event source should produce the same canonical event candidate shape.

Required fields:

- `id`
- `eventType`
- `title`
- `startTime`
- `peakTime`
- `endTime`
- `sourceType`
- `sourceName`
- `confidence`

Observer geometry fields:

- `targetAzimuthDeg`
- `targetAltitudeDeg`
- `targetDirectionLabel`
- `sunAltitudeDeg`
- `moonAltitudeDeg`
- `moonIllumination`
- `localBestViewingTime`
- `localBestViewingAzimuthDeg`
- `localBestViewingAltitudeDeg`
- `localBestViewingDirectionLabel`

The source layer should only answer:

- Does this event exist?
- When does it happen?
- Is it geometrically relevant to this observer?
- Where in the sky is it at the useful local time?

It should not answer:

- Is the weather good?
- Where should the user drive?
- How should this be explained in marketing copy?

## Event Families

### Moon Phases

Primary source:

- Astronomy Engine

Reference source:

- USNO Moon Phases API

Derivation:

1. Enumerate primary lunar phases with `SearchMoonQuarter` / `NextMoonQuarter`.
2. Emit `full_moon` when `quarter === 2`.
3. Optionally emit new, first quarter, and last quarter later, but full moon is the only MVP phase that is consistently user-facing.
4. For the observer, sample a window around the phase time and find the best local time when the Moon is above the horizon.
5. Attach Moon azimuth, altitude, Sun altitude, and lunar illumination.

User-location behavior:

- The phase instant is global.
- Visibility and local best viewing time are observer-specific.

Implementation priority:

- Already suitable for MVP.

### Supermoon

Primary source:

- Astronomy Engine

Derivation:

1. Enumerate full moons.
2. Find nearest lunar apsis with `SearchLunarApsis` / `NextLunarApsis`.
3. Mark a full moon as `supermoon` when the nearest apsis is perigee and close enough to the full-moon instant.

Recommended rule:

- Use a conservative threshold, such as full moon within 36 hours of perigee for `supermoon`.
- Store the actual geocentric distance when we add it so the label can be audited.

User-location behavior:

- The full moon/perigee relationship is global.
- The useful local viewing time is observer-specific.

Implementation priority:

- Supermoon is MVP-ready.

### Lunar Eclipses

Primary source:

- Astronomy Engine

Reference sources:

- NASA eclipse resources
- USNO eclipse pages/APIs where applicable

Derivation:

1. Enumerate lunar eclipses with `SearchLunarEclipse` / `NextLunarEclipse`.
2. Use the returned eclipse kind: penumbral, partial, or total.
3. Build start/end from the returned semi-duration fields.
4. For the observer, sample the eclipse interval and check whether the Moon is above the horizon during useful phases.
5. Emit the event only if some meaningful part of the eclipse is locally visible.
6. Prefer total and partial eclipses. Penumbral eclipses should have lower confidence because they are subtle.

User-location behavior:

- The eclipse event is global.
- The event should be shown only where the Moon is above the horizon during a useful part of the event.

Implementation priority:

- MVP-ready.

### Solar Eclipses

Primary source:

- Astronomy Engine

Reference sources:

- NASA eclipse resources
- USNO solar eclipse year list

Derivation:

1. Use `SearchLocalSolarEclipse` / `NextLocalSolarEclipse` for the observer.
2. Emit only eclipses visible at the observer's coordinates.
3. Use the returned local partial begin, peak, total/annular begin/end where available, and partial end.
4. Attach local Sun azimuth and altitude at peak.
5. Capture eclipse kind and obscuration when available.

User-location behavior:

- This is inherently local.
- A global eclipse should not become a user event unless the user is inside the visibility region.

Implementation priority:

- MVP-ready through local derivation.

Notes:

- USNO documents a solar-eclipse year-list API through 2050, but its documented local solar-eclipse circumstances API is limited to 2017-2024. Do not rely on that API for future user-specific runtime circumstances.

### Planet Oppositions

Primary source:

- Astronomy Engine

Reference source:

- JPL Horizons

Derivation:

1. For superior planets, use `SearchRelativeLongitude(body, 0, startDate)` or the library's documented opposition/conjunction convention.
2. Emit when Mars, Jupiter, or Saturn reaches opposition.
3. At peak, compute observer azimuth/altitude and the best local viewing time, usually near local midnight.
4. Attach apparent magnitude from `Illumination` where available.

User-location behavior:

- Opposition timing is effectively global.
- Viewability and local best time are observer-specific.

Implementation priority:

- Implemented for Jupiter, Saturn, and Mars.

### Mercury / Venus Greatest Elongation

Primary source:

- Astronomy Engine

Reference source:

- JPL Horizons

Derivation:

1. Use `SearchMaxElongation` for Mercury and Venus.
2. Use returned visibility direction, evening or morning.
3. For the observer, search the local twilight window around the event date.
4. Emit only when the planet gets above a practical altitude threshold during twilight, such as 8-10 degrees.
5. Attach azimuth, altitude, and local best viewing time.

User-location behavior:

- Elongation timing is global.
- Practical visibility is strongly observer-specific.

Implementation priority:

- MVP-ready.

### Venus Peak Brightness

Primary source:

- Astronomy Engine

Reference source:

- JPL Horizons

Derivation:

1. Use `SearchPeakMagnitude(Body.Venus, startDate)`.
2. Around the peak date, sample local morning/evening windows.
3. Emit as a `venus_best_visibility` event if Venus is above the horizon while the Sun is low enough for practical viewing.

User-location behavior:

- Peak brightness timing is global.
- Useful viewing time is local.

Implementation priority:

- Good MVP or near-MVP event because it is easy to explain and bright.

### Moon-Planet Close Approaches

Primary source:

- Astronomy Engine

Reference source:

- JPL Horizons

Derivation:

1. For each useful pair, sample the requested time range.
2. Candidate pairs:
   - Moon and Venus
   - Moon and Jupiter
   - Moon and Saturn
   - Moon and Mars
3. Compute topocentric angular separation for the observer.
4. Find local minima in separation and refine the minimum time.
5. Emit if separation is below the configured threshold.
6. At the best local time, require both bodies to be above the horizon and the Sun to be low enough.

Recommended thresholds:

- Moon-Venus: 6 degrees
- Moon-Jupiter: 6 degrees
- Moon-Saturn: 5 degrees
- Moon-Mars: 5 degrees

User-location behavior:

- Close approach timing can differ slightly by observer because the Moon has strong parallax.
- Compute this topocentrically, not only geocentrically.

Implementation priority:

- MVP-ready.

### Planet-Planet Conjunctions / Close Approaches

Primary source:

- Astronomy Engine

Reference source:

- JPL Horizons

Derivation:

1. Use `SearchRelativeLongitude` for true conjunction/opposition-style longitude events where appropriate.
2. For "cool visual close approach" events, scan topocentric angular separation for selected bright-planet pairs.
3. Refine local minima.
4. Emit when separation is below a visual threshold and both objects are above the horizon at a useful local time.

Recommended initial pairs:

- Venus-Jupiter
- Mars-Jupiter
- Jupiter-Saturn
- Venus-Saturn
- Mercury-Venus, only when twilight visibility is acceptable

Recommended thresholds:

- 1 degree: exceptional
- 3 degrees: good
- 5 degrees: maybe, only for very bright/easy objects

User-location behavior:

- Planet-planet geometry is mostly global, but local horizon/twilight determines whether it matters.

Implementation priority:

- MVP-ready.

### Planet Parades

Primary source:

- Derived heuristic from Astronomy Engine

Reference source:

- JPL Horizons for spot checks

Derivation:

1. Sample the observer's sky every 15-30 minutes in the requested time range.
2. Include Mercury, Venus, Mars, Jupiter, and Saturn.
3. Count planets above a practical altitude threshold, such as 10 degrees.
4. Require the Sun altitude to be at or below a twilight threshold, such as -6 degrees.
5. Cluster consecutive samples into visibility windows.
6. Emit a `planet_parade` event when at least 3 bright planets are visible together.
7. Attach the start/end window, peak time, included planets, azimuth span, and representative direction.

User-location behavior:

- This is a derived, observer-specific event.
- There is no canonical official "planet parade" feed.

Implementation priority:

- MVP-ready as a heuristic, but labels should stay conservative.

### Meteor Showers

Primary source:

- Curated annual catalog from IMO and AMS

Reference sources:

- NASA meteor shower overview pages

Derivation:

1. Maintain one reviewed catalog entry per shower occurrence per year.
2. Store activity start/end, peak date/time UTC, radiant RA/Dec, expected ZHR, velocity, parent body, and moonlight notes where available.
3. For the observer, compute when the radiant is highest during local dark hours around the peak.
4. Emit the peak night and optionally nearby "active but not peak" nights for strong showers.
5. Attach radiant altitude and Moon illumination at the local best viewing time.

Required catalog fields:

- `id`
- `name`
- `startTimeUtc`
- `peakTimeUtc`
- `endTimeUtc`
- `radiantRaDeg`
- `radiantDecDeg`
- `expectedZhr`
- `velocityKmS`
- `parentBody`
- `sourceUrl`
- `reviewStatus`

User-location behavior:

- Shower activity is global.
- Radiant altitude and best night are local.
- Some showers are much better in one hemisphere.

Implementation priority:

- MVP-ready for the curated starter set.

### Aurora

Primary source:

- NOAA SWPC OVATION aurora forecast
- NOAA SWPC Aurora Viewline for Tonight and Tomorrow Night

Context source:

- NASA DONKI for CMEs, geomagnetic storms, solar flares, and related alerts

Derivation:

1. Fetch NOAA OVATION gridded forecast JSON and/or the NOAA viewline product.
2. Convert the user's lat/lon to the product coordinate space.
3. Emit an aurora opportunity when the user's location is inside or near the predicted auroral visibility region.
4. Attach forecast issue time, forecast valid time, hemisphere, probability/intensity where available, and confidence.
5. Use DONKI only to enrich the event or create a "watch" state before NOAA visibility is strong enough.

User-location behavior:

- Aurora is inherently location-specific.
- It is also time-sensitive. Treat it as a near-live event, not a 6-month calendar event.

Implementation priority:

- Tier 2. Valuable, but needs live feed handling and careful confidence language.

### ISS Passes

Primary source:

- CelesTrak GP data in OMM JSON or TLE format

Alternative official source:

- NASA Spot the Station ISS Orbit Ephemeris Message data

Derivation:

1. Fetch ISS orbital data.
2. Propagate the orbit across the user's requested time range.
3. Find local pass windows where the ISS is above the observer horizon.
4. Keep only visually observable passes:
   - observer is in darkness or twilight
   - ISS is sunlit
   - pass reaches a useful maximum altitude, such as 20 degrees
5. Emit start, peak, and end of pass with appears/maximum/disappears azimuth and altitude.

User-location behavior:

- Fully observer-specific.

Implementation priority:

- Tier 2.

Implementation note:

- If using TLE/OMM, add a maintained SGP4 propagation library instead of hand-rolling orbital propagation.
- If using NASA ISS OEM, parse the state vectors and interpolate/propagate with care. The NASA file spans about 15 days and is updated only periodically, so it is not a long-horizon source.

## Runtime Policy

For a user request:

1. Run deterministic local sources for the requested time range.
2. Load curated meteor shower occurrences intersecting the time range.
3. Fetch live feeds only where the event family needs them:
   - NOAA for aurora
   - CelesTrak/NASA for ISS
4. Project every candidate to the observer location.
5. Return event candidates with source and confidence.

For scheduled maintenance:

1. Review meteor-shower catalog data annually.
2. Add reference tests for major future eclipses, conjunctions, elongations, and oppositions.
3. Spot-check local engine outputs against JPL Horizons and USNO.
4. Cache external feeds and respect source rate/fair-use rules.

## Source Notes

- JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- USNO Astronomical Applications API: https://aa.usno.navy.mil/data/api
- NASA Eclipse: https://eclipse.gsfc.nasa.gov/eclipse.html
- AMS Meteor Shower Calendar: https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
- IMO Meteor Shower Calendar: https://www.imo.net/files/meteor-shower/cal2026.pdf
- NOAA SWPC Aurora 30-Minute Forecast: https://www.swpc.noaa.gov/products/aurora-30-minute-forecast
- NOAA SWPC Aurora Viewline: https://www.swpc.noaa.gov/products/aurora-viewline-tonight-and-tomorrow-night-experimental
- NASA DONKI / CCMC: https://ccmc.gsfc.nasa.gov/tools/DONKI/
- NASA Spot the Station: https://www.nasa.gov/spot-the-station/
- CelesTrak GP data formats: https://celestrak.org/NORAD/documentation/gp-data-formats.php
- Astronomy Engine: https://github.com/cosinekitty/astronomy
