# Oh My OpenCode setup

This repo integrates with Oh My OpenCode (OMO) using native OMO hooks.

Goal:

- Start the worker service on demand (HTTP API on `127.0.0.1:37777` by default)
- Stream tool observations to the worker on `PostToolUse`
- Summarize and complete sessions on `Stop`

## 1) Configure native hooks in OMO

Edit `~/.config/opencode/oh-my-opencode.json` (or `.opencode/oh-my-opencode.json`).

Print a ready-to-paste config snippet from your repo root:

```bash
npm run opencode:hooks
```

If you only want the `hooks` object:

```bash
npm run opencode:hooks:only
```

Example output (replace `/ABS/PATH/TO/opencode-mem`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs hook opencode context",
            "timeout": 60
          },
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs hook opencode session-init",
            "timeout": 60
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs hook opencode observation",
            "timeout": 120
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs hook opencode summarize",
            "timeout": 120
          },
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs hook opencode session-complete",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Notes:

- No `~/.claude/settings.json` is required in this setup.
- `worker-service.cjs hook ...` auto-starts the worker if needed.
- OMO's hook runner pipes JSON to stdin; `worker-service.cjs hook ...` consumes stdin.

## 2) (Optional) Add MCP search tools to OpenCode

Configure a local MCP server that points at `plugin/scripts/mcp-server.cjs`.
Exact config location depends on whether you are using OpenCode global config or project config.

Example config is provided at:

`.opencode/opencode.json.example`
