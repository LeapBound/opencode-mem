# opencode-mem

Persistent memory + search tooling for OpenCode / Oh My OpenCode.

This repository is a fork/port of `thedotmack/claude-mem` with the goal of running the same
worker + MCP search tools in an OpenCode/OMO workflow.

## What you get

- Worker service (HTTP API, default port `37777`)
- SQLite-backed storage (default `~/.claude-mem/claude-mem.db`)
- MCP tools: `search`, `timeline`, `get_observations`, `save_memory`

## Oh My OpenCode integration

Oh My OpenCode has a `claude-code-hooks` compatibility hook that can run Claude Code-style
`~/.claude/settings.json` hooks on `PostToolUse`, `Stop`, etc.

Use that to call this repo's worker hook commands.

See: `docs/opencode-setup.md`

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
