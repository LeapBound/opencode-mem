# opencode-mem

Persistent memory + search tooling for OpenCode / Oh My OpenCode.

This repository is a fork/port of `thedotmack/opencode-mem` with the goal of running the same
worker + MCP search tools in an OpenCode/OMO workflow.

## What you get

- Worker service (HTTP API, default port `37777`)
- SQLite-backed storage (default `~/.opencode-mem/opencode-mem.db`)
- MCP tools: `search`, `timeline`, `get_observations`, `save_memory`

## Oh My OpenCode integration

Use Oh My OpenCode native hooks directly in `~/.config/opencode/oh-my-opencode.json`
to call this repo's worker hook commands.

See: `docs/opencode-setup.md`

Helper commands:

- `npm run opencode:hooks` -> full OMO-native config snippet (`{ "hooks": ... }`)
- `npm run opencode:hooks:only` -> only the `hooks` object

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
