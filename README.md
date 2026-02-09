# opencode-mem

Persistent memory + search tooling for OpenCode / Oh My OpenCode.

This repository is a fork/port of `thedotmack/claude-mem` with the goal of running the same
worker + MCP search tools in an OpenCode/OMO workflow.

## What you get

- Worker service (HTTP API, default port `37777`)
- SQLite-backed storage (default `~/.claude-mem/claude-mem.db`)
- MCP tools: `search`, `timeline`, `get_observations`, `save_memory`

## Oh My OpenCode integration

Oh My OpenCode can run this project through its `claude-code-hooks` bridge.
Enable `claude_code.hooks` in `~/.config/opencode/oh-my-opencode.json`, then provide
hook commands via Claude Code-style `~/.claude/settings.json`.

Use that to call this repo's worker hook commands.

See: `docs/opencode-setup.md`

Helper commands:

- `npm run opencode:hooks` -> Claude-style `hooks` JSON
- `npm run opencode:hooks:omo` -> OMO `claude_code.hooks` snippet
- `npm run opencode:hooks:all` -> both snippets in one JSON object

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
