# Learnings

## Seed
- Use OpenCode plugin hooks as the primary integration path; avoid OMO hook wiring.
- Do not read from `~/.claude/plugins` at runtime (avoid claude marketplace dependency).
- User requirement: do not use OpenRouter; summary should come from OpenCode and then be sent to worker.

## 2026-02-11: Plugin API evidence
- Official plugin docs confirm plugin input includes `client`, and hooks include `chat.message`, `tool.execute.before/after`, and `event` with `session.idle`.
- Official plugin typings expose `chat.params` with `provider` + `model`, useful when reusing active provider/model context.
- Plugin typings expose `experimental.chat.messages.transform`, which can read/transform full message arrays before model call.
- Current `plugin/opencode-plugin.js` does not call `ctx.client` yet; it only shells out to worker hooks (`context/session-init/observation/summarize/session-complete`).

## 2026-02-11: Worker ingest surface (summary)
- Worker already supports direct ingest of a pre-generated structured summary via `POST /api/sessions/summarize/ingest`.
- Ingest payload expects `{ contentSessionId, summary }`, where `summary` fields are strings and align to `SummaryInput` (`notes` may be `null`).
- Ingest path runs the same privacy check semantics as worker-side summarization and may return `{ status: "skipped", reason: "private" }`.

## 2026-02-11: Recursion guard
- Plugin-side summarization creates an internal temporary OpenCode session; we must ignore plugin hooks for that internal session to avoid recursive context/session-init/observation noise.
- Implemented by caching internal session IDs (TTL) and early-returning from `chat.message`, `tool.execute.*`, and `event(session.idle)` when the session is internal.

## 2026-02-11: Plugin-side idle summary implementation
- Cache active per-session model config from `chat.message` (`input.model.providerID/modelID`) so idle summarization can reuse the same model context when available.
- Generate summary on `session.idle` via `ctx.client.session` APIs: fetch session messages, prompt a temporary OpenCode session for structured output, parse, then ingest to worker via `POST /api/sessions/summarize/ingest`.
- Keep fail-open behavior by falling back to existing worker `summarize` hook whenever plugin-side generation or ingest fails; keep `session-complete` flow unchanged.
