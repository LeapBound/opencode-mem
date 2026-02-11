# Decisions

## Seed
- (pending) Summary generation source and model selection.

## 2026-02-11: Decision candidate (pending implementation)
- Prefer generating summary inside plugin using OpenCode APIs (`ctx.client`) instead of worker-side OpenRouter/Gemini/Claude summarization.
- Keep existing `POST /api/sessions/summarize` queue path as fallback for compatibility; add a dedicated summary-ingest path for plugin-provided structured summary.

## 2026-02-11: Summary ingest contract (documented)
- Contract for plugin -> worker summary storage uses `POST /api/sessions/summarize/ingest` with body `{ contentSessionId, summary }`.
- `summary` is a flat object matching `SummaryInput` keys exactly: `request`, `investigated`, `learned`, `completed`, `next_steps`, `notes`.
- Add simple, implementable validation + size limits at the HTTP boundary (recommended in draft; enforce later in code).
