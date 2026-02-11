# Issues

## Seed
- Need to confirm how an OpenCode plugin can call OpenCode LLM/agent and retrieve session messages.
- Need to confirm best worker endpoint/contract for direct summary ingest (avoid re-summarizing inside worker).

## 2026-02-11
- Reverted accidental local edit: restored `OPENCODE_MEM_OPENROUTER_MODEL` default back to repository baseline in `src/shared/SettingsDefaultsManager.ts`.

## 2026-02-11: Follow-up risk notes
- Plugin summary generation now depends on OpenCode `ctx.client.session` APIs and the worker HTTP endpoint being reachable; failures are fail-open (fallback summarize) but can increase duplicate/extra summary attempts if transient network/process errors occur around idle events.
