# OLES1603

Local app commands:

- `npm run dev` starts the Next.js app at `http://localhost:3000`.
- `npm run build` creates a production Next.js build.
- `npm start` serves the production build after `npm run build`.
- `npm test` runs the Vitest backend/domain tests.
- `npm run events:all -- --date 2025-03-01 --days 31 --lat -33.8688 --lon 151.2093` queries all implemented raw event sources.
- `npm run events:local -- --date 2025-03-01 --days 31 --lat -33.8688 --lon 151.2093` queries locally-derived ephemeris events.
- `npm run events:meteor -- --date 2026-08-01 --days 45 --lat -33.8688 --lon 151.2093` queries curated meteor-shower events.
- `npm run events:aurora -- --date 2026-04-17 --days 1 --lat 64.1466 --lon -21.9426` queries NOAA SWPC aurora opportunities.
- `npm run events:iss -- --date 2026-04-17 --days 3 --lat -33.8688 --lon 151.2093` queries visible ISS passes.

Planning document:

- [Astronomy Events Product Plan](./docs/astronomy-events-plan.md)

Backend foundation in place:

- `src/engine/`: event-source contracts plus composition helpers
- `src/domain/`: canonical event schema plus compatibility wrappers for visibility/scoring
- `src/scoring/`: practical visibility and cool/final score logic
- `src/pipeline/`: recommendation orchestration and normalization
- `src/providers/`: astronomy, weather, and Google Maps Platform integrations
- `src/api/`: backend-facing events API composition
- `src/data/`: curated meteor shower scaffolding
- `tests/`: pipeline, scoring, visibility, provider, and data coverage

Current focus:

- The backend now has the three required integration surfaces:
  - events generation
  - weather connection
  - maps/routing connection
- The place recommendation path is centered on reachable spots within a 20-minute drive, not dark-sky catalogs.
- OpenRouter is the LLM layer for choosing between close candidate locations and for generating the short event description shown to the user.

Environment setup:

- Copy `.env.example` to `.env.local` or `.env` and fill in the keys.
- `GOOGLE_MAPS_API_KEY` powers nearby place search and route-time filtering. Without it, the localhost app uses local fallback viewing spots.
- `OPEN_METEO_BASE_URL` keeps the weather client configurable.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL=openai/gpt-5.4-mini` power the LLM-assisted location choice and display copy.
- The app caps searches at 14 days ahead to stay inside Open-Meteo's forecast window.
