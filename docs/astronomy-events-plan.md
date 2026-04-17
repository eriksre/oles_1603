# Astronomy Events Product Plan

## Goal

Build a Vercel-hosted product that tells a user about astronomical events **before** they happen, filters them to events the user can **actually** see, and suggests a nearby place that improves the viewing experience.

The product should answer four questions:

1. What interesting event is happening soon given my location? Does it meet my coolness threshold?
2. Is the sky going to be clear? Are there going to be clouds. 
3. Where nearby should I go? (20 minute drive)

## Product Shape

The product has three layers:

1. `Event generation`: identify upcoming astronomy events in a particular place on earth.
2. `Visibility filtering`: determine whether the event is practically observable from a candidate location at a given time - clouds. 
3. `Place recommendation`: rank nearby viewpoints and suggest the best one.

The user experience should reduce to a simple recommendation such as:

`Blood moon tonight at 7:18 PM. Best viewing spot is Observatory Hill. Face 102 deg ESE and look 8 deg above the horizon. Cool score: 91.`

The LLM is not the astronomy source of truth.

- The event engine decides what event exists and when it happens.
- The maps provider decides what places are reachable within the drive cap.
- The weather provider decides whether conditions are usable.
- OpenRouter with `gpt-5.4-mini` decides between close candidate places and writes the short event description shown to the user.

## Design Principles

- Do not depend on one "all astronomy events" API. That API does not really exist in a clean MVP form.
- Derive predictable events locally where possible.
- Use external APIs only for dynamic or operational data.
- Prefer events that are easy to explain and visually rewarding.
- Hide technically valid but practically useless events.

## Event Strategy

Events should be grouped by how they are sourced.

### 1. Derived Locally

These are predictable and should be computed in our backend using [Astronomy Engine](https://github.com/cosinekitty/astronomy):

- Moon phases: new, first quarter, full, last quarter
- Supermoon and micromoon style events using full moon plus perigee/apogee proximity
- Lunar eclipses, including blood moons
- Solar eclipses
- Moon rise and set azimuths
- Moon and bright-planet close approaches
- Planet-planet conjunctions
- Planet oppositions
- Mercury and Venus greatest elongations
- Venus peak brightness
- Multi-planet visibility windows and "planet parade" style groupings
- Sun rise, set, and twilight state for any observer

Why this works:

- Astronomy Engine already supports horizon-based observer calculations, rise/set, twilight, moon phases, eclipses, conjunctions, oppositions, apsides, elongations, and related geometry.
- Local calculation reduces vendor lock-in and gives us consistent logic across event types.

### 2. Curated Annual Data

These are predictable, but there is no obvious clean public machine-readable API for the MVP. We should maintain them as reviewed JSON in the repo.

- Meteor showers

Recommended sources for yearly review:

- [NASA Meteor Showers](https://science.nasa.gov/solar-system/meteors-meteorites/meteor-showers/)
- [American Meteor Society Meteor Shower Calendar](https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/)
- [International Meteor Organization Calendar](https://www.imo.net/the-2026-meteor-shower-calendar-is-here/)

For meteor showers, the curated dataset should include:

- shower name
- start date
- end date
- peak date/time
- expected peak rate when available
- radiant constellation or rough sky area
- notes about moonlight interference

### 3. Live External Feeds

These should come from external sources because they are dynamic or operational.

- Aurora activity
- Satellite / ISS passes
- Weather and cloud forecast
- Places, routing, and geocoding
- LLM-assisted location choice and event description

Recommended sources:

- Aurora: [NOAA SWPC Aurora 30-minute Forecast](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) and [Aurora Viewline Tonight and Tomorrow Night](https://www.swpc.noaa.gov/products/aurora-viewline-tonight-and-tomorrow-night-experimental). Also [NASA DONKI API](https://api.nasa.gov/) for geomagnetic storm and solar flare alerts (free, REST).
- ISS passes: [N2YO API](https://www.n2yo.com/api/) — free account required, 100 visual pass queries/hr. Provides rise/peak/set azimuth and altitude directly. **Note: the OpenNotify ISS pass endpoint (`/iss-pass.json`) was removed in 2020 and no longer works.**
- Weather: [Open-Meteo](https://open-meteo.com/en/docs) for cloud cover, [7Timer! ASTRO](http://7timer.info/doc.php?lang=en#astro) for seeing and atmospheric transparency
- Maps and routing: Google Maps Platform for candidate places plus drive-time filtering
- LLM: [OpenRouter](https://openrouter.ai/) with `gpt-5.4-mini` for location tie-breaking and event copy

## Recommended MVP Event Catalog

The first version should include the following event types.

### Tier 1: Strong MVP

- Full moon
- Supermoon / unusually large full moon
- Lunar eclipse / blood moon
- Solar eclipse
- Moon with Venus or Jupiter close approach
- Planet-planet conjunction
- Mercury best evening or morning appearance
- Venus best evening or morning appearance
- Planet parade / multi-planet visibility window

### Tier 2: High Value, Slightly Harder

- Meteor showers
- Aurora
- ISS passes

### Tier 3: Later

- Bright comets
- Mercury or Venus transits
- Small-body observability like bright asteroids

## Event Schema

Every event candidate should be represented with a consistent schema.

Core fields:

- `id`
- `event_type`
- `title`
- `description`
- `start_time`
- `peak_time`
- `end_time`
- `source_type` (`derived`, `curated`, `live`)
- `source_name`
- `confidence`

Observer-specific fields:

- `observer_lat`
- `observer_lon`
- `observer_elevation_m`
- `target_azimuth_deg`
- `target_altitude_deg`
- `target_direction_label`
- `azimuth_span_start_deg` for wide events like planet lineups
- `azimuth_span_end_deg`
- `sun_altitude_deg`
- `moon_altitude_deg`
- `moon_illumination`

Practical fields:

- `cloud_cover_pct`
- `low_cloud_cover_pct`
- `visibility_km`
- `wind_speed_kph`
- `distance_m`
- `travel_time_minutes`
- `view_quality_score`
- `cool_score`
- `final_score`

User-facing recommendation fields:

- `recommended_place_name`
- `recommended_place_lat`
- `recommended_place_lon`
- `instruction_text`

## Visibility Model

An event should not be shown simply because it exists. It should be shown only if it is practically observable.

### Step 1: Astronomical Visibility

For a candidate place and time, compute:

- azimuth
- altitude
- rise/set state
- local twilight state

Rules:

- If `target_altitude_deg <= 0`, the event is below the horizon and is not visible.
- If `0 < target_altitude_deg < 10`, mark it as `horizon_sensitive`.
- If `target_altitude_deg >= 10`, it is much more likely to be practically viewable.

These rules matter especially for:

- moonrise events
- eclipse rise/set moments
- Mercury and Venus low in twilight
- aurora near the horizon

### Step 2: Sky Brightness

Also compute the Sun altitude for the same place and time.

Suggested thresholds:

- `sun_altitude > -6`: too bright for subtle events
- `-12 < sun_altitude <= -6`: civil to nautical twilight, acceptable only for bright objects
- `-18 < sun_altitude <= -12`: reasonably dark
- `sun_altitude <= -18`: fully dark sky

This should affect the score heavily for:

- meteor showers
- aurora
- faint planets
- low-altitude conjunctions

### Step 3: Weather Visibility

Use forecast data to score the likelihood of actual visibility.

Important weather fields:

- total cloud cover
- low cloud cover
- visibility
- precipitation chance
- wind

Rules of thumb:

- Horizon events depend heavily on low cloud cover.
- Meteor showers and aurora depend heavily on total cloud cover and darkness.
- Bright planets and the Moon can tolerate moderate haze or partial cloud.

### Step 4: Place Selection

This is the place-selection problem.

For the MVP, use heuristics:

- Search candidate places from a maps API around the user.
- Compute drive time for each candidate and discard anything above the travel cap.
- Prefer places with a clearer horizon for low-altitude events.
- Prefer places that are faster to reach when multiple candidates are otherwise similar.
- Treat the default MVP cap as `20 minutes driving`.
- If two candidates are close, use OpenRouter to choose the better one and produce the final human-readable description.

Later, this can be improved with terrain horizon profiling: sample DEM elevation at N points along the target azimuth from the candidate location and compute the actual horizon angle in that direction. This tells you whether a hill or building is blocking a low-altitude event from that specific spot.

## Azimuth and Direction Model

This product should always tell the user where to look.

### Single-Target Events

For single-target events, compute:

- exact azimuth
- exact altitude
- cardinal direction label

Examples:

- blood moon at peak
- Jupiter at opposition
- Venus at greatest elongation
- Moon next to Jupiter

### Path-Based Events

For moving objects, compute a path instead of one point.

Examples:

- ISS pass: appearance azimuth, max altitude, disappearance azimuth

### Span-Based Events

For wide sky events, represent the direction as a range.

Examples:

- planet parade
- broad meteor shower radiant region explanation

For these, store:

- `azimuth_span_start_deg`
- `azimuth_span_end_deg`
- a user-facing summary like `Look from WSW through S`

## Place Recommendation Model

The system should evaluate nearby candidate places and pick the one that best balances viewing quality and convenience.

### Candidate Place Types

Use the maps provider to search for candidate places like:

- viewpoint / lookout
- observation deck
- park
- beach
- other obvious open-sky public spots

### Place Ranking Inputs

Each candidate place should be scored using:

- travel time from user
- distance
- place type
- openness heuristic for target azimuth
- local weather at that point if available

### Example Heuristics

- For moonrise, sunrise-adjacent events, or low-altitude eclipses:
  - strongly prefer east- or west-open horizon places
- For planets high in the sky:
  - travel time matters more than open horizon
- In all cases:
  - do not recommend any place beyond the configured drive-time cap

## Cool Scale

The product should include a user-adjustable "cool scale" so people can filter out weak or inconvenient events.

### Cool Score Purpose

The cool score is not purely scientific. It is a product score that estimates whether the event is worth the user's effort.

### Suggested Cool Score Components

Base the score on:

- `rarity_score`
- `visual_impact_score`
- `naked_eye_score`
- `timing_score`
- `weather_score`
- `accessibility_score`

Suggested weights:

- `30% rarity`
- `25% visual impact`
- `20% naked-eye visibility`
- `10% timing practicality`
- `10% weather confidence`
- `5% accessibility`

### Example Base Cool Scores

- Total solar eclipse: `100`
- Total lunar eclipse / blood moon: `95`
- Strong aurora opportunity: `90`
- Strong multi-planet lineup: `85`
- Good meteor shower peak: `80`
- Partial lunar eclipse: `75`
- Moon with Venus or Jupiter close approach: `70`
- High ISS pass: `65`
- Supermoon: `60`
- Ordinary full moon: `40`

### Local Adjustment Rules

Reduce the score if:

- cloud conditions are poor
- the object is too low to the horizon
- the event happens at an impractical hour
- travel time is too long
- the event is too subtle for casual observers

This should produce recommendations like:

- `Cool score 91: Blood moon rising in 43 minutes, 6-minute walk, face ESE`
- `Cool score 38: Mercury technically visible, but too low in bright twilight`

## Proposed External Services

### Astronomy

- Core engine: [Astronomy Engine](https://github.com/cosinekitty/astronomy) — chosen over alternatives (Skyfield, Astronomia, PyEphem) because it ships as a native TypeScript/JavaScript package with no external data file dependency, covers all required computations (phases, eclipses, conjunctions, oppositions, rise/set, ISS-equivalent orbit propagation, elongations, apsides, twilight), and runs directly in a Next.js serverless environment without a Python runtime.
- ISS and satellite pass prediction: [N2YO API](https://www.n2yo.com/api/) for pre-computed visual pass data; Astronomy Engine can also propagate TLE orbits from [CelesTrak](https://celestrak.org/) for custom pass calculations.
- Space weather and aurora triggers: [NASA DONKI API](https://api.nasa.gov/) for coronal mass ejections, geomagnetic storm alerts, and X/M-class solar flare notifications.
- Validation reference for eclipse messaging: [NASA Eclipses](https://science.nasa.gov/eclipses/)

### Weather

- Cloud cover: [Open-Meteo](https://open-meteo.com/en/docs) — free, no API key, 10,000 calls/day. Provides stratified cloud layers (low/mid/high separately), which matters because high thin cirrus ruins stargazing but is invisible to casual observation.
- Seeing and transparency: [7Timer! ASTRO](http://7timer.info/doc.php?lang=en#astro) — free, no API key, global coverage, 3-day forecast at 3-hour intervals. The only free global source for atmospheric seeing (arcseconds) and transparency (mag/airmass). Call from a server-side route since the endpoint is HTTP-only.
- Possible later paid upgrade for seeing: [Astrospheric API](https://www.astrospheric.com/DynamicContent/api_info.html) — ~$15 CAD/yr, 81-hour forecasts, North America and Europe, 20 calls/day (cache aggressively; data updates every 6 hours).

Useful weather fields:

- `cloud_cover` (total)
- `cloud_cover_low` (below 3 km — most important for horizon events)
- `cloud_cover_mid`
- `cloud_cover_high` (high cirrus — ruins transparency even when sky looks clear)
- `visibility`
- `precipitation_probability`
- `wind_speed`
- `seeing` (from 7Timer! ASTRO — atmospheric turbulence in arcseconds)
- `transparency` (from 7Timer! ASTRO — haze/aerosol level in mag/airmass)

### Maps and Location

**Primary maps stack:** Google Maps Platform.

Use:

- Places API to search nearby viewpoints, lookouts, parks, beaches, and observation decks
- Routes API to calculate drive time from the user to each candidate place
- Geocoding if we need manual search or reverse-geocoded labels

The key product rule is:

- Search candidate places around the user
- Calculate drive time for each
- Keep only places reachable within `20 minutes driving`
- Rank the remaining places by travel time plus viewing suitability for the event direction

Map display can still use any normal frontend mapping library later. That is separate from the backend place-selection logic.

### Notifications

- Browser geolocation via the [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- Web push via the [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- Service workers via the [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- Scheduled checks via [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

## Architecture Direction

### Frontend

- Mobile-first web app
- Browser location permission with manual location fallback
- Event list sorted by `final_score`
- Event detail page with time, direction, and travel recommendation

### Backend

- Next.js app on Vercel
- API routes or server actions for event queries
- an `events API` that composes event generation, weather, and maps routing
- a `weather API` connection for cloud/visibility data
- a `maps API` connection for candidate places and drive-time filtering
- an `LLM API` connection via OpenRouter for location tie-breaking and event description
- Scheduled background jobs for refreshing external feeds and curated event windows

### Data Layers

- Derived event calculators
- Curated event JSON for meteor showers
- Weather fetchers
- Maps / route fetchers
- Event scoring engine

## Recommended Implementation Order

### Phase 1: Geometry and Core Event Logic

Build:

- observer input
- moon phase calculations
- eclipse calculations
- conjunction calculations
- azimuth and altitude calculations
- twilight calculations

Output:

- raw event candidates for a location and time range

### Phase 2: Practical Visibility

Add:

- weather integration
- visibility scoring
- event suppression for bad conditions

Output:

- events the user can likely see

### Phase 3: Place Recommendation

Add:

- maps place search
- route-time filtering with a `20 minute drive` cap
- direction-aware place filtering
- candidate ranking for the best reachable place

Output:

- events plus recommended places

### Phase 4: Alerts and Product Polish

Add:

- cool scale filter
- saved user preferences
- push notifications
- scheduled checks

Output:

- proactive recommendations instead of only passive search

## MVP Success Criteria

The MVP is successful if a user can:

1. open the site on a phone
2. provide their location
3. see at least one upcoming event worth considering
4. understand exactly when and where to look
5. optionally get a better nearby viewing recommendation

## MVP Required APIs

The MVP backend must have these three integrations:

1. `Events API`
   - backed by local event generation using Astronomy Engine
   - returns normalized event candidates for a place and time range
2. `Weather API`
   - cloud and visibility forecast for the observer and optionally candidate places
3. `Maps API`
   - candidate place search
   - drive-time calculation
   - filter to places reachable within `20 minutes driving`

4. `LLM API`
   - OpenRouter as the provider
   - `gpt-5.4-mini` as the default model
   - chooses between close candidate locations
   - writes the short event description shown to the user

## API Reference Summary

| Service | Purpose | Cost | Key required? |
|---|---|---|---|
| Astronomy Engine (JS lib) | All derived event calculations | Free | No |
| Open-Meteo | Cloud cover (stratified), weather | Free, 10k/day | No |
| 7Timer! ASTRO | Seeing, atmospheric transparency | Free, no documented cap | No |
| NASA DONKI | Space weather, aurora triggers, solar flares | Free, 1,000/hr | Free signup |
| N2YO API | ISS and satellite pass predictions | Free, 100 visual/hr | Free signup |
| Google Maps Platform | Places search, routing, geocoding, drive-time filtering | Paid | GCP key |
| OpenRouter | LLM tie-breaking and event description generation | Paid | API key |

For the actual MVP path, the required stack is:

- Astronomy Engine for event generation
- Open-Meteo for weather
- Google Maps Platform for place search plus route-time filtering
- OpenRouter for location choice and the short user-facing description

## Risks and Constraints

- Meteor shower data likely needs yearly manual review.
- Line-of-sight quality is difficult to solve perfectly without terrain and obstruction modeling.
- Some event classes are scientifically valid but visually underwhelming for casual users.
- API cost can grow quickly if place search and routing are called too often.
- The product must avoid promising visibility when clouds or low horizon conditions make that unrealistic.

## Current Recommendation

Build the first release around these event types:

- full moon and supermoon
- lunar eclipses / blood moons
- solar eclipses
- moon with bright planets
- planet-planet conjunctions
- Mercury and Venus best visibility windows
- multi-planet lineups
- meteor showers
- aurora

Do not start with rare-object catalog work like comets or asteroids. The strongest first demo is not the most scientifically complete one. It is the one that gives a user a short, trustworthy recommendation they can act on immediately.
