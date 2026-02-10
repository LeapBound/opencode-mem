import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUN_RUNNER = path.join(__dirname, "scripts", "bun-runner.js");
const WORKER_SERVICE = path.join(__dirname, "scripts", "worker-service.cjs");

const DEDUPE_TTL_MS = 5 * 60 * 1000;
const STOP_DEBOUNCE_MS = 2500;

const seen = new Map();
const stopLocks = new Map();
const stopTimes = new Map();
const toolInputCache = new Map();

function nowMs() {
  return Date.now();
}

function pruneSeen() {
  const now = nowMs();
  for (const [key, ts] of seen.entries()) {
    if (now - ts > DEDUPE_TTL_MS) {
      seen.delete(key);
    }
  }

  for (const [key, item] of toolInputCache.entries()) {
    if (!item || now - item.ts > DEDUPE_TTL_MS) {
      toolInputCache.delete(key);
    }
  }
}

function markSeen(key) {
  pruneSeen();
  if (seen.has(key)) return false;
  seen.set(key, nowMs());
  return true;
}

function extractOutputText(toolOutput) {
  if (!toolOutput || typeof toolOutput !== "object") return "";
  if (typeof toolOutput.output === "string") return toolOutput.output;
  if (typeof toolOutput.title === "string") return toolOutput.title;
  return "";
}

function execHook(event, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [BUN_RUNNER, WORKER_SERVICE, "hook", "opencode", event], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      reject(new Error(`opencode-mem hook timeout (${event}, ${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function safeError(err) {
  return err instanceof Error ? err.message : String(err);
}

function safeLog(level, message, meta = {}) {
  const line = `[opencode-mem plugin] ${message}`;
  if (level === "error") {
    console.error(line, meta);
    return;
  }
  console.log(line, meta);
}

function buildPromptText(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function unwrapMemContext(text) {
  if (typeof text !== "string") return "";
  const match = text.match(/<opencode-mem-context>([\s\S]*?)<\/opencode-mem-context>/);
  if (!match) return text;
  return (match[1] || "").trim();
}

export default async function OpenCodeMemPlugin(ctx) {
  const cwd = ctx?.directory || process.cwd();
  const pluginUrl = pathToFileURL(__filename).href;

  return {
    async "tool.execute.before"(input, output) {
      const sessionID = input?.sessionID || "unknown";
      const callID = input?.callID || "";
      if (!callID) return;

      pruneSeen();
      toolInputCache.set(`${sessionID}:${callID}`, {
        ts: nowMs(),
        args: output?.args || {},
      });
    },

    async "chat.message"(input, output) {
      const sessionID = input?.sessionID || "unknown";
      const messageID = input?.messageID || "";
      const prompt = buildPromptText(output?.parts || []);

      const dedupeKey = `chat:${sessionID}:${messageID || prompt}`;
      if (!markSeen(dedupeKey)) return;

      try {
        const contextResult = await execHook(
          "context",
          {
            session_id: sessionID,
            cwd,
            prompt,
            hook_event_name: "UserPromptSubmit",
            hook_source: "opencode-plugin",
            plugin_url: pluginUrl,
          },
          10000,
        );

        if (contextResult.code === 0 && contextResult.stdout && output && Array.isArray(output.parts)) {
          const contextText = unwrapMemContext(contextResult.stdout);
          if (contextText) output.parts.unshift({ type: "text", text: contextText });
        }

        const initResult = await execHook(
          "session-init",
          {
            session_id: sessionID,
            cwd,
            prompt,
            hook_event_name: "UserPromptSubmit",
            hook_source: "opencode-plugin",
            plugin_url: pluginUrl,
          },
          20000,
        );

        if (initResult.code !== 0) {
          safeLog("error", "session-init failed", {
            sessionID,
            code: initResult.code,
            stderr: initResult.stderr,
          });
        }
      } catch (err) {
        safeLog("error", "chat.message handler failed", {
          sessionID,
          error: safeError(err),
        });
      }
    },

    async "tool.execute.after"(input, output) {
      if (!output) return;

      const sessionID = input?.sessionID || "unknown";
      const callID = input?.callID || "";
      const toolName = input?.tool || "unknown";
      const cacheKey = `${sessionID}:${callID}`;
      const cachedInput = toolInputCache.get(cacheKey);
      const toolInput = cachedInput?.args || output?.metadata?.args || {};
      const toolResponse = {
        output: extractOutputText(output),
        metadata: output?.metadata || {},
      };

      const dedupeKey = `tool:${sessionID}:${callID || `${toolName}:${JSON.stringify(toolInput)}`}`;
      if (!markSeen(dedupeKey)) return;
      toolInputCache.delete(cacheKey);

      try {
        const result = await execHook(
          "observation",
          {
            session_id: sessionID,
            cwd,
            tool_name: toolName,
            tool_input: toolInput,
            tool_response: toolResponse,
            tool_use_id: callID || undefined,
            hook_event_name: "PostToolUse",
            hook_source: "opencode-plugin",
            plugin_url: pluginUrl,
          },
          30000,
        );

        if (result.code !== 0) {
          safeLog("error", "observation failed", {
            sessionID,
            toolName,
            code: result.code,
            stderr: result.stderr,
          });
        }
      } catch (err) {
        safeLog("error", "tool.execute.after handler failed", {
          sessionID,
          toolName,
          error: safeError(err),
        });
      }
    },

    async event({ event }) {
      if (event?.type !== "session.idle") return;

      const sessionID = event?.properties?.sessionID;
      if (!sessionID) return;

      if (stopLocks.get(sessionID)) return;
      const last = stopTimes.get(sessionID) || 0;
      if (nowMs() - last < STOP_DEBOUNCE_MS) return;

      stopLocks.set(sessionID, true);
      stopTimes.set(sessionID, nowMs());

      try {
        const summarizeResult = await execHook(
          "summarize",
          {
            session_id: sessionID,
            cwd,
            hook_event_name: "Stop",
            hook_source: "opencode-plugin",
            plugin_url: pluginUrl,
          },
          30000,
        );

        if (summarizeResult.code !== 0) {
          safeLog("error", "summarize failed", {
            sessionID,
            code: summarizeResult.code,
            stderr: summarizeResult.stderr,
          });
        }

        const completeResult = await execHook(
          "session-complete",
          {
            session_id: sessionID,
            cwd,
            hook_event_name: "Stop",
            hook_source: "opencode-plugin",
            plugin_url: pluginUrl,
          },
          10000,
        );

        if (completeResult.code !== 0) {
          safeLog("error", "session-complete failed", {
            sessionID,
            code: completeResult.code,
            stderr: completeResult.stderr,
          });
        }
      } catch (err) {
        safeLog("error", "event(session.idle) handler failed", {
          sessionID,
          error: safeError(err),
        });
      } finally {
        stopLocks.delete(sessionID);
      }
    },
  };
}
