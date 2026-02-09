#!/usr/bin/env node

import path from "node:path";

const repoRoot = process.cwd();
const bunRunner = path.join(repoRoot, "plugin", "scripts", "bun-runner.js");
const workerService = path.join(repoRoot, "plugin", "scripts", "worker-service.cjs");

function hookCommand(platform, event) {
  return `node ${JSON.stringify(bunRunner)} ${JSON.stringify(workerService)} hook ${platform} ${event}`;
}

function startCommand() {
  return `node ${JSON.stringify(bunRunner)} ${JSON.stringify(workerService)} start`;
}

const config = {
  hooks: {
    UserPromptSubmit: [
      {
        matcher: "*",
        hooks: [
          { type: "command", command: startCommand(), timeout: 60 },
          { type: "command", command: hookCommand("opencode", "session-init"), timeout: 60 },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          { type: "command", command: startCommand(), timeout: 60 },
          { type: "command", command: hookCommand("opencode", "observation"), timeout: 120 },
        ],
      },
    ],
    Stop: [
      {
        matcher: "*",
        hooks: [
          { type: "command", command: startCommand(), timeout: 60 },
          { type: "command", command: hookCommand("opencode", "summarize"), timeout: 120 },
          { type: "command", command: hookCommand("opencode", "session-complete"), timeout: 30 },
        ],
      },
    ],
  },
};

const omoConfig = {
  claude_code: {
    hooks: true,
  },
};

if (process.argv.includes("--omo")) {
  process.stdout.write(`${JSON.stringify(omoConfig, null, 2)}\n`);
} else if (process.argv.includes("--all")) {
  process.stdout.write(`${JSON.stringify({ oh_my_opencode: omoConfig, claude_settings: config }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}
