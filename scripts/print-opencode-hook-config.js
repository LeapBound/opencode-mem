#!/usr/bin/env node

import path from "node:path";

const repoRoot = process.cwd();
const bunRunner = path.join(repoRoot, "plugin", "scripts", "bun-runner.js");
const workerService = path.join(repoRoot, "plugin", "scripts", "worker-service.cjs");

function hookCommand(platform, event) {
  return `node ${JSON.stringify(bunRunner)} ${JSON.stringify(workerService)} hook ${platform} ${event}`;
}

const nativeOmoConfig = {
  hooks: {
    UserPromptSubmit: [
      {
        matcher: "*",
        hooks: [
          // Inject memory context into prompt (OMO will wrap stdout)
          { type: "command", command: hookCommand("opencode", "context"), timeout: 60 },
          { type: "command", command: hookCommand("opencode", "session-init"), timeout: 60 },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          { type: "command", command: hookCommand("opencode", "observation"), timeout: 120 },
        ],
      },
    ],
    Stop: [
      {
        matcher: "*",
        hooks: [
          { type: "command", command: hookCommand("opencode", "summarize"), timeout: 120 },
          { type: "command", command: hookCommand("opencode", "session-complete"), timeout: 30 },
        ],
      },
    ],
  },
};

if (process.argv.includes("--hooks-only")) {
  process.stdout.write(`${JSON.stringify(nativeOmoConfig.hooks, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(nativeOmoConfig, null, 2)}\n`);
}
