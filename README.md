# OLES1603

Planning document:

- [Astronomy Events Product Plan](./docs/astronomy-events-plan.md)

Backend foundation in place:

- `src/engine/`: event-source contracts plus composition helpers
- `src/domain/`: canonical event schema plus compatibility wrappers for visibility/scoring
- `src/scoring/`: practical visibility and cool/final score logic
- `src/pipeline/`: recommendation orchestration and normalization
- `src/providers/`: provider contracts plus Open-Meteo integration
- `src/data/`: curated meteor shower and dark-sky catalog scaffolding
- `tests/`: pipeline, scoring, visibility, provider, and data coverage

Current focus:

- The astronomy engine can plug into `AstronomyEventSource`.
- The backend can already normalize, score, suppress, rank, and annotate events.
- Place recommendation heuristics are present at the pipeline level; richer provider implementations can be added next without changing the scoring contract.
