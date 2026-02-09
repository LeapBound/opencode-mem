# Oh My OpenCode setup

This repo can be integrated with Oh My OpenCode (OMO) by using OMO as the runtime and enabling its `claude-code-hooks` bridge.

Goal:

- Start the worker service (HTTP API on `127.0.0.1:37777` by default)
- Stream tool observations to the worker on `PostToolUse`
- Summarize + complete sessions on `Stop`

## 1) Start the worker

From the `opencode-mem` repo root:

```bash
bun plugin/scripts/worker-service.cjs start
```

## 2) Enable the bridge in OMO config

Edit `~/.config/opencode/oh-my-opencode.json` (or `.opencode/oh-my-opencode.json`) and ensure:

```json
{
  "claude_code": {
    "hooks": true
  }
}
```

`claude-code-hooks` is enabled by default unless explicitly disabled in `disabled_hooks`.

## 3) Configure hook commands (Claude-style settings consumed by OMO bridge)

OMO reads Claude Code hook configuration from `~/.claude/settings.json` (or `./.claude/settings.json`).

Create/update `~/.claude/settings.json` with commands pointing at this repo checkout.

Quick helper (prints ready-to-paste JSON using your current absolute repo path).
This includes prompt-time memory context injection via `UserPromptSubmit`.

```bash
npm run opencode:hooks
```

Print OMO snippet only:

```bash
npm run opencode:hooks:omo
```

Print both snippets (`oh_my_opencode` + `claude_settings`) together:

```bash
npm run opencode:hooks:all
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

## 4) (Optional) Add MCP search tools to OpenCode

Configure a local MCP server that points at `plugin/scripts/mcp-server.cjs`.
Exact config location depends on whether you are using OpenCode global config or project config.

Example config is provided at:

`.opencode/opencode.json.example`
