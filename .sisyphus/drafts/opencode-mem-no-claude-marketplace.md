# Draft: Stop Reading ~/.claude/plugins Marketplace

## Requirements (confirmed)
- Project is OpenCode-focused; must NOT read anything under `~/.claude/plugins/...`.
- Specifically, do not use Claude Code marketplace plugin version files to manage opencode-mem worker.

## Evidence (logs)
- opencode-mem worker repeatedly restarts due to version mismatch:
  - `Worker version mismatch detected - auto-restarting {pluginVersion=9.0.15, workerVersion=0.1.0}`
- `pluginVersion=9.0.15` matches the Claude marketplace package:
  - `~/.claude/plugins/marketplaces/thedotmack/package.json` version `9.0.15`
- Running worker reports version `0.1.0` via `/api/version`.

## Root Cause
- Version check compares running worker version against marketplace plugin version.
- Code path:
  - `src/services/infrastructure/HealthMonitor.ts:getInstalledPluginVersion()` reads `MARKETPLACE_ROOT/package.json`.
  - `MARKETPLACE_ROOT` is derived from `src/shared/paths.ts` and points into `~/.claude/plugins/...`.

## Fix Direction
- Replace marketplace-based expected version with build-time version (`__DEFAULT_PACKAGE_VERSION__`) for opencode-mem scripts.
- Remove import/usage of `MARKETPLACE_ROOT` from version checking.

## Open Questions
- None for the core change.
- Optional follow-up: do we also want to eliminate other `~/.claude/*` integrations (non-marketplace) from this repo?
