# OLES1603

Local app commands:

- `npm run dev` starts the Next.js app at `http://localhost:3000`.
- `npm run build` creates a production Next.js build.
- `npm start` serves the production build after `npm run build`.
- `npm test` runs the Vitest backend/domain tests.
- `npm run events:all -- --lat -33.8688 --lon 151.2093` queries all implemented raw event sources from now through the next 7 days.
- `npm run events:local -- --lat -33.8688 --lon 151.2093` queries locally-derived ephemeris events from now through the next 7 days.
- `npm run events:meteor -- --lat -33.8688 --lon 151.2093` queries curated meteor-shower events from now through the next 7 days.
- `npm run events:aurora -- --lat -42.8821 --lon 147.3272` queries BOM aurora opportunities for Australia from now through the next 7 days.
- `npm run events:iss -- --lat -33.8688 --lon 151.2093` queries visible ISS passes from now through the next 7 days.
- `npm run bom:aurora -- --notice all` queries the BOM space-weather aurora notice API asynchronously.

Planning document:

- [Astronomy Events Product Plan](./docs/astronomy-events-plan.md)

Backend foundation in place:

- `src/engine/`: event-source contracts plus composition helpers
- `src/domain/`: canonical event schema plus compatibility wrappers for visibility/scoring
- `src/scoring/`: practical visibility and cool/final score logic
- `src/pipeline/`: recommendation orchestration and normalization
- `src/providers/`: astronomy, weather, and LLM integrations
- `src/api/`: backend-facing events API composition
- `src/data/`: curated meteor shower scaffolding
- `tests/`: pipeline, scoring, visibility, provider, and data coverage

Current focus:

- The backend now has the required integration surfaces:
  - events generation
  - weather connection
  - event description generation
- Recommendations are based on the user's supplied location only; the app does not search for alternate viewing spots.
- OpenRouter is the LLM layer for generating the short event description shown to the user.

Environment setup:

- Copy `.env.example` to `.env` and fill in the keys.
- `OPEN_METEO_BASE_URL` keeps the weather client configurable.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL=openai/gpt-5.4-mini` power the display copy.
- `BOM_API_KEY` enables BOM space-weather aurora alert/watch/outlook queries.
- The app caps searches at 14 days ahead to stay inside Open-Meteo's forecast window.

BOM aurora query surface:

- `GET /api/bom/aurora` returns `alert`, `watch`, and `outlook` in one server-side request fanout.
- `GET /api/bom/aurora?notice=alert` returns only the current BOM aurora alert state.
- `src/engine/aurora-event-source.ts` now uses BOM aurora notices instead of NOAA OVATION and only emits events when the observer falls inside BOM's visible latitude region and the notice window contains dark-sky viewing time.
