# OpenCode-Generated Summary -> Worker Ingest (No OpenRouter)

## TL;DR

Generate session summaries using OpenCode's own model/agent from inside the OpenCode plugin, then send the summary to the opencode-mem worker for storage/search context.

Deliverables:
- Plugin generates a structured summary on `session.idle` using OpenCode LLM (no OpenRouter)
- Worker accepts a "summary ingest" request and persists into `session_summaries`
- End-to-end verification: OpenCode plugin -> worker -> DB -> context injection

Constraints:
- Do NOT read from `~/.claude/plugins` at runtime
- Do NOT use OpenRouter
- Keep existing worker summarization pipeline working (do not break legacy endpoints)

## Task Checklist

- [x] Confirm OpenCode plugin has an API to call OpenCode LLM/agent and access session messages
- [x] Define summary contract (fields, size limits, serialization) compatible with existing `SummaryInput`
- [x] Implement plugin-side summary generation on `session.idle` using OpenCode model config
- [x] Add worker HTTP endpoint to ingest summary (contentSessionId + SummaryInput) and store it atomically
- [x] Add/extend tests for summary ingest endpoint + storage
- [x] Update docs to describe "OpenCode summary -> worker" flow and verification
- [x] Verify end-to-end: build + tests + worker smoke + plugin smoke

## Verification

Build + unit/integration tests:
```bash
npm run -s build
npm run -s test:context
npm run -s test:infra
```

Worker/API smoke:
```bash
bun plugin/scripts/worker-service.cjs start
curl -sS -o /dev/null -w "health_http=%{http_code}\n" http://127.0.0.1:37777/api/health
```

Plugin smoke (manual):
- Install plugin via `npm run -s opencode:plugin:install`
- Start OpenCode, run a short chat + one tool call, wait for idle
- Confirm worker DB has a new `session_summaries` row for that content session

## Notes / Non-goals

- Non-goal: changing DB schema (prefer existing `session_summaries` / `SummaryInput`)
- Non-goal: removing existing worker-based summarization; keep it as fallback
