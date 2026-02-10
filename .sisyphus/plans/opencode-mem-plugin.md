# OpenCode-Mem: Plugin-Only Integration Plan

## TL;DR

Move OpenCode-Mem from “OMO command hooks wiring” to **OpenCode native plugin** as the default integration.

Deliverables:
- OpenCode plugin entrypoint that runs the existing lifecycle hook pipeline: `context` → `session-init` → `observation` → `summarize` → `session-complete`
- A safe installer/manager that writes OpenCode config (`opencode.json`/`opencode.jsonc`) and disables conflicting OMO paths
- Docs updated to **plugin-first** and legacy hooks relegated to fallback
- Deterministic, repeatable verification (build + tests + smoke)

Estimated effort: Medium
Parallelization: YES (2 waves)
Critical path: Plugin contract validation → Installer safety/idempotency → End-to-end smoke → Commit/push

## Task Checklist

- [x] Validate OpenCode plugin runtime hook contract (events + payload shapes)
- [x] Implement plugin entrypoint using correct OpenCode hooks (system/context injection + observations + stop)
- [x] Implement safe plugin manager (backup, atomic write, JSON/JSONC handling, idempotent)
- [x] Ensure npm packaging works for `"plugin": ["opencode-mem"]` (tarball contains required runtime files)
- [x] Update docs to plugin-first; legacy hooks are fallback
- [x] Verify: build + tests + smoke
- [x] Release hygiene: commit + push

---

## Context

### Original request
- “Plugin is a better plan than OMO hooks; build the final product (not MVP).”
- OMO `claude-code-hooks` will be disabled.

### Current integration baseline
- Existing worker + HTTP API (default `127.0.0.1:37777`)
- Existing CLI hook entrypoints: `plugin/scripts/worker-service.cjs hook opencode <event>`
- Existing OMO hook snippet generator: `scripts/print-opencode-hook-config.js`

---

## Work objectives

### Core objective
Make OpenCode-Mem usable via **OpenCode native plugin config** so users install once and avoid manual OMO hook JSON wiring.

### Concrete deliverables (files)
- `plugin/opencode-plugin.js` (OpenCode plugin entrypoint)
- `scripts/opencode-plugin-manager.js` (install/status/uninstall/print)
- `docs/opencode-setup.md` (plugin-first instructions)
- `README.md` (plugin-first)
- `.opencode/opencode.json.example` updated to include `plugin` entry

### Definition of done
- `npm run -s build` succeeds
- `npm run -s test:context` succeeds
- `npm run -s test:infra` succeeds
- “Plugin-only” user flow works without manual hook snippets

### Guardrails (Metis)
- Do not broadly disable unrelated OMO hooks; only disable/clean the overlapping memory pathway.
- Installer must be idempotent and non-destructive (only touches its own plugin entry / known legacy commands).
- Plugin must degrade gracefully if worker is unavailable/timeouts occur (log + continue; never block chat).

### Defaults applied (override if needed)
- OpenCode support target: latest stable OpenCode release available at implementation time.
- Config write target: user config `~/.config/opencode/opencode.json` (or `opencode.jsonc`) by default; project config only when explicitly requested.
- Plugin entry preference:
  - Dev: `file://.../plugin/opencode-plugin.js`
  - Release: package name `opencode-mem` in OpenCode config

---

## Verification strategy

### Primary verification (agent-executable)

Build + tests:
```bash
npm run -s build
npm run -s test:context
npm run -s test:infra
```

Plugin manager smoke (isolated HOME, no user machine pollution):
```bash
TMP_HOME="/tmp/opencode-mem-plugin-test-$RANDOM-$RANDOM";
mkdir -p "$TMP_HOME";
HOME="$TMP_HOME" node scripts/opencode-plugin-manager.js install;
HOME="$TMP_HOME" node scripts/opencode-plugin-manager.js status;
HOME="$TMP_HOME" node scripts/opencode-plugin-manager.js uninstall;
HOME="$TMP_HOME" node scripts/opencode-plugin-manager.js status;
```

Worker/API smoke:
```bash
npm run -s worker:status
curl -sS -o /dev/null -w "health_http=%{http_code}\n" http://127.0.0.1:37777/api/health
curl -sS -o /dev/null -w "readiness_http=%{http_code}\n" http://127.0.0.1:37777/api/readiness
```

### Required negative tests
- Worker not running: plugin handlers should continue without throwing.
- Duplicate events (same session/tool call): no duplicate DB writes (dedupe key strategy).

---

## Execution strategy

Wave 1 (contract + safety):
- Validate OpenCode plugin contract (event names/payload shapes) against official docs + at least one real OpenCode run.
- Make installer safe: backup, atomic write, JSONC support, idempotency.

Wave 2 (product polish + release):
- Docs consolidation (plugin-first), legacy hooks clearly marked fallback.
- Stabilize infra tests (timeouts/flakes) without hiding real deadlocks.
- Commit + push.

---

## TODOs

1) Validate OpenCode plugin contract (CRITICAL)

What to do:
- Confirm OpenCode expects `plugin` array in config and accepts either package name or `file://...` URL.
- Confirm runtime plugin handler names + payload shapes for:
  - prompt submission / message creation (context injection)
  - tool completion event (observation capture)
  - idle/stop event (summarize + session-complete)

Acceptance criteria:
- Documented mapping of OpenCode events → OpenCode-Mem lifecycle calls, including exact payload fields used.
- Add a small fixture-based test harness that can replay captured OpenCode plugin events to prove handler compatibility.

References:
- OpenCode config docs: https://opencode.ai/docs/config/#plugins
- OMO plugin lifecycle patterns (for comparison): `/home/fredgu/git_home/oh-my-opencode/src/plugin/*.ts`


2) Production packaging for plugin loading by package name

What to do:
- Ensure the published npm package exposes a stable plugin entrypoint when OpenCode config uses `"plugin": ["opencode-mem"]`.
- Ensure all required runtime files are shipped (plugin entrypoint + scripts invoked by it).
- Add CI check or a local `npm pack` validation step to confirm the tarball contains required files.

Acceptance criteria:
- `npm pack` tarball contains `plugin/opencode-plugin.js` and any scripts it shells out to.
- OpenCode can load the plugin by package name (not only via `file://`).


3) Implement plugin entrypoint with dedupe + failure-mode handling

What to do:
- Ensure plugin runs the lifecycle pipeline:
  - On prompt: call `context` and inject returned text into the message; then call `session-init`
  - On tool completion: call `observation`
  - On idle/stop: call `summarize` then `session-complete`
- Add idempotency:
  - per message: `sessionID + messageID`
  - per tool: `sessionID + callID`
  - per stop: debounce per session
- Fail-open behavior: any hook failure logs but does not throw.

Acceptance criteria:
- Running OpenCode with plugin enabled produces no crashes even if worker is down.
- Dedupe prevents double-write when events repeat.

References:
- Existing hook pipeline entrypoint: `plugin/scripts/worker-service.cjs` (command: `hook opencode <event>`)
- Existing handler semantics: `src/cli/handlers/context.ts`, `src/cli/handlers/session-init.ts`, `src/cli/handlers/observation.ts`, `src/cli/handlers/summarize.ts`, `src/cli/handlers/session-complete.ts`


4) Implement plugin manager (install/status/uninstall/print)

What to do:
- Detect config paths:
  - User: `~/.config/opencode/opencode.json` or `opencode.jsonc`
  - Project: `.opencode/opencode.json` or `opencode.jsonc`
- Edits must be atomic (write temp → rename) and create a timestamped backup on first mutation.
- JSONC support: preserve comments by editing minimal JSON where possible, or explicitly document that config will be normalized to JSON.
- Installer must:
  - Add plugin entry (package name or local `file://...`)
  - Remove legacy opencode-mem OMO hook commands from `~/.config/opencode/oh-my-opencode.json` if present
  - Ensure OMO `claude-code-hooks` is disabled (to prevent duplicate memory writes)

Acceptance criteria:
- `install` is idempotent (running twice produces no additional changes).
- `uninstall` removes only opencode-mem entry.
- Legacy cleanup is scoped strictly to known markers (no broad deletion).

References:
- Legacy hook markers: `scripts/print-opencode-hook-config.js`
- OMO config location: `docs/opencode-setup.md` (update to reflect plugin-first)


5) Update docs to plugin-first and lock down scope

What to do:
- `docs/opencode-setup.md`: plugin-first install, status, uninstall, verification.
- `README.md`: plugin-first; legacy hooks explicitly fallback.
- `.opencode/opencode.json.example`: include `plugin` entry.

Acceptance criteria:
- A new user can install by running a single command and sees memory features working.


6) Stabilize infra tests without masking defects

What to do:
- For CLI-based worker JSON status tests, set per-test timeouts high enough for slow CI, and add assertions that stdout is non-empty before parsing.
- Add a note explaining why timeout is large (worker startup/health can exceed Bun default timeout in CI).

Acceptance criteria:
- `npm run -s test:infra` passes reliably (3 consecutive runs).

References:
- `tests/infrastructure/worker-json-status.test.ts`


7) Release hygiene: commit and push

What to do:
- Stage changes.
- Create one atomic commit.
- Push to remote.

Acceptance criteria:
- `git status --short` clean
- Remote has the commit.

Suggested commit message:
- `feat(plugin): add OpenCode plugin integration and installer`

---

## Success criteria

- Plugin-only install works; no manual OMO hook JSON needed.
- OMO `claude-code-hooks` disabled; no duplicate memory writes.
- Build/tests pass.
