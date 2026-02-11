# OpenCode setup (plugin-first)

This repo now integrates with OpenCode using a native plugin entrypoint.

Goal:

- One memory entrypoint (plugin) instead of manual hook chains
- Automatic context + session-init + observation + summarize + session-complete flow
- Built-in duplicate protection in plugin lifecycle handlers

Summary flow:

- On `session.idle`, the plugin generates a structured summary using OpenCode's own model/provider context and ingests it into the worker via `POST /api/sessions/summarize/ingest`.
- If plugin-side summary generation or ingest fails, it falls back to the worker-side `summarize` hook.

## 1) Install plugin into OpenCode config

From repo root:

```bash
npm run opencode:plugin:install
```

Default target config:

- `~/.config/opencode/opencode.json`

Project-local target:

```bash
node scripts/opencode-plugin-manager.js install --project
```

Package-name entry instead of local file URL:

```bash
node scripts/opencode-plugin-manager.js install --package
```

## 2) Check status

```bash
npm run opencode:plugin:status
```

Status reports:

- Whether plugin entry exists
- Whether old memory hook commands are still detected
- Whether local plugin file exists

## 3) Verify worker + API

```bash
npm run worker:status
curl -sS http://127.0.0.1:37777/api/health
curl -sS http://127.0.0.1:37777/api/readiness
```

## 4) Remove plugin (if needed)

```bash
npm run opencode:plugin:uninstall
```

## Notes

- Installer auto-cleans legacy opencode-mem hook commands from `~/.config/opencode/oh-my-opencode.json`.
- Installer also adds `claude-code-hooks` to `disabled_hooks` in OMO config to avoid duplicate memory writes.
- Legacy hook snippets are still available but should be treated as fallback only.

Config safety:

- Reads both JSON and JSONC (`.jsonc`), so comments and trailing commas are accepted on read.
- Before the first mutation of any config file, creates a sibling backup like `opencode.json.bak-YYYYMMDD-HHMMSS`.
- Writes are atomic (temp file + rename) and idempotent (no rewrite if there are no net config changes).
