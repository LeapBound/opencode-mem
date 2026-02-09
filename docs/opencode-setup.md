# Oh My OpenCode setup

This repo can be integrated with Oh My OpenCode (OMO) via its `claude-code-hooks` compatibility hook.

Goal:

- Start the worker service (HTTP API on `127.0.0.1:37777` by default)
- Stream tool observations to the worker on `PostToolUse`
- Summarize + complete sessions on `Stop`

## 1) Start the worker

From the `opencode-mem` repo root:

```bash
bun plugin/scripts/worker-service.cjs start
```

## 2) Configure Claude Code-style hooks

OMO reads Claude Code hook configuration from `~/.claude/settings.json` (or `./.claude/settings.json`).

Create/update `~/.claude/settings.json` with commands pointing at this repo checkout.

Quick helper (prints ready-to-paste JSON using your current absolute repo path):

```bash
npm run opencode:hooks
```

Example (replace `/ABS/PATH/TO/opencode-mem`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs start",
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
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs start",
            "timeout": 60
          },
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
            "command": "node /ABS/PATH/TO/opencode-mem/plugin/scripts/bun-runner.js /ABS/PATH/TO/opencode-mem/plugin/scripts/worker-service.cjs start",
            "timeout": 60
          },
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

- The `opencode` platform is an alias of `claude-code` for hook input normalization.
- OMO's hook runner will pipe JSON to stdin; `worker-service.cjs hook ...` consumes stdin.

## 3) (Optional) Add MCP search tools to OpenCode

Configure a local MCP server that points at `plugin/scripts/mcp-server.cjs`.
Exact config location depends on whether you are using OpenCode global config or project config.

Example config is provided at:

`.opencode/opencode.json.example`
