# opencode-mem

Persistent memory + search tooling for OpenCode / Oh My OpenCode.

This repository is a fork/port of `thedotmack/opencode-mem` with the goal of running the same
worker + MCP search tools in an OpenCode/OMO workflow.

## What you get

- Worker service (HTTP API, default port `37777`)
- SQLite-backed storage (default `~/.opencode-mem/opencode-mem.db`)
- MCP tools: `search`, `timeline`, `get_observations`, `save_memory`

## OpenCode plugin integration (recommended)

Use this project as an OpenCode plugin (single memory entrypoint, no manual hook wiring).

See: `docs/opencode-setup.md`

Helper commands:

- `npm run opencode:plugin:install` -> install plugin entry into OpenCode config
- `npm run opencode:plugin:status` -> show plugin install state + legacy hook detection
- `npm run opencode:plugin:uninstall` -> remove plugin entry
- `npm run opencode:plugin:print` -> print a minimal `{ "plugin": [...] }` snippet

Legacy hook commands remain available only as fallback:

- `npm run opencode:hooks`
- `npm run opencode:hooks:only`

## Development

Build:

```bash
npm run build
```

Run worker:

```bash
bun plugin/scripts/worker-service.cjs start
```

## License

AGPL-3.0 (inherited from upstream).
