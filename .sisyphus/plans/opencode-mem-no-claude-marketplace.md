# Stop Reading ~/.claude/plugins Marketplace For Version Checks

## TL;DR

Remove the dependency on Claude Code marketplace (`~/.claude/plugins/...`) for opencode-mem worker version checking.
Today, the worker is repeatedly restarted because it compares its own version (`0.1.0`) against an unrelated marketplace plugin version (`9.0.15`).

Deliverables:
- Version check uses opencode-mem build-time version (`__DEFAULT_PACKAGE_VERSION__`) instead of `MARKETPLACE_ROOT/package.json`.
- No reads from `~/.claude/plugins/...` for worker version logic.
- Smoke verification: opencode-mem plugin no longer triggers repeated `/api/admin/shutdown` loops.

## Task Checklist

- [x] Remove marketplace-based version lookup
- [x] Ensure no other worker startup path reads `~/.claude/plugins/...` for version logic
- [x] Run smoke verification with OpenCode plugin enabled
- [x] Commit + push

---

## Context

User requirement:
- “不管什么模式，我们这个项目是 opencode 的，不要去读 `.claude plugins` 下的东西。”

Observed behavior (from `~/.opencode-mem/logs/opencode-mem-2026-02-10.log`):
- `Worker version mismatch detected - auto-restarting {pluginVersion=9.0.15, workerVersion=0.1.0}`
- Frequent `POST /api/admin/shutdown` in tight loops.

Root cause:
- Version checker reads `~/.claude/plugins/marketplaces/thedotmack/package.json` (Claude marketplace), so it uses `9.0.15` as the “expected” version.
- That is unrelated to opencode-mem’s own packaged version.

---

## Verification Strategy

Build + tests:
```bash
npm run -s build
npm run -s test:infra
```

Runtime smoke (no restart loop):
1) Ensure OpenCode config includes opencode-mem plugin.
2) Restart OpenCode.
3) Send a message and run one tool (e.g. Bash `pwd`).
4) Check opencode-mem logs for the absence of repeated version-mismatch restarts.

Log checks:
```bash
LOG=~/.opencode-mem/logs/opencode-mem-$(date +%Y-%m-%d).log
grep -n "Worker version mismatch detected" "$LOG" | tail -n 20
grep -n "POST /api/admin/shutdown" "$LOG" | tail -n 20
```

Expected:
- No continuous loop of mismatch + shutdown.

---

## TODOs

1) Remove marketplace-based version lookup

What to change:
- Update `src/services/infrastructure/HealthMonitor.ts`:
  - Remove imports and logic reading `MARKETPLACE_ROOT/package.json`.
  - Replace `getInstalledPluginVersion()` with a build-time value:
    - `declare const __DEFAULT_PACKAGE_VERSION__: string;`
    - `const packageVersion = typeof __DEFAULT_PACKAGE_VERSION__ !== 'undefined' ? __DEFAULT_PACKAGE_VERSION__ : '0.0.0-dev';`
  - In `checkVersionMatch(port)`, set `pluginVersion = packageVersion`.

Why:
- `__DEFAULT_PACKAGE_VERSION__` is already injected by esbuild during `npm run build` (see `scripts/build-hooks.js`), so it’s the correct “expected” version for this opencode-mem build.

Acceptance criteria:
- `checkVersionMatch()` no longer touches `~/.claude/plugins/...`.
- Running worker no longer reports `pluginVersion=9.0.15` in logs.


2) Ensure no other worker startup path reads `~/.claude/plugins/...`

What to do:
- Search for `MARKETPLACE_ROOT` usages and remove/replace them if they influence worker startup/version decisions.

Acceptance criteria:
- No remaining code paths for worker version logic reference `MARKETPLACE_ROOT`.


3) Run smoke verification with OpenCode plugin enabled

What to do:
- Install opencode-mem plugin into OpenCode config (file URL or package name).
- Restart OpenCode.
- Trigger: message → Bash `pwd` → idle.
- Inspect log: ensure no shutdown loop.

Acceptance criteria:
- Logs do not show repeated version mismatch auto-restarting.


4) Commit + push

Commit message suggestion:
- `fix(worker): stop reading claude marketplace version`

Acceptance criteria:
- `git status --short` clean
- Pushed to remote.

---

## Notes / Non-goals

- This plan only removes reads under `~/.claude/plugins/...` for worker version checking.
- It does not remove all Claude-related integrations under `~/.claude/` (those are separate features and may be addressed later if desired).
