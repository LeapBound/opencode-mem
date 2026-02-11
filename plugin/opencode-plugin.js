import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUN_RUNNER = path.join(__dirname, "scripts", "bun-runner.js");
const WORKER_SERVICE = path.join(__dirname, "scripts", "worker-service.cjs");

const DEDUPE_TTL_MS = 5 * 60 * 1000;
const STOP_DEBOUNCE_MS = 2500;
const WORKER_PORT = Number(process.env.OPENCODE_MEM_WORKER_PORT || 37777);
const WORKER_BASE_URL = `http://127.0.0.1:${WORKER_PORT}`;
const SUMMARY_TRANSCRIPT_MAX_MESSAGES = 60;
const SUMMARY_TRANSCRIPT_MAX_CHARS = 30000;
const INTERNAL_SESSION_TTL_MS = 5 * 60 * 1000;

const seen = new Map();
const stopLocks = new Map();
const stopTimes = new Map();
const toolInputCache = new Map();
const sessionModelCache = new Map();
const internalSessionCache = new Map();

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

  for (const [key, model] of sessionModelCache.entries()) {
    if (!model || now - model.ts > DEDUPE_TTL_MS) {
      sessionModelCache.delete(key);
    }
  }

  for (const [key, ts] of internalSessionCache.entries()) {
    if (!ts || now - ts > INTERNAL_SESSION_TTL_MS) {
      internalSessionCache.delete(key);
    }
  }
}

function isInternalSession(sessionID) {
  if (!sessionID) return false;
  return internalSessionCache.has(sessionID);
}

function markInternalSession(sessionID) {
  if (!sessionID) return;
  internalSessionCache.set(sessionID, nowMs());
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

function unwrapClientData(result) {
  if (!result || typeof result !== "object") return result;
  if (Object.prototype.hasOwnProperty.call(result, "data")) {
    return result.data;
  }
  return result;
}

function clipText(text, maxChars) {
  if (typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function extractPartsText(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function buildSessionTranscript(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";

  const recent = messages.slice(-SUMMARY_TRANSCRIPT_MAX_MESSAGES);
  const blocks = [];

  for (const entry of recent) {
    const role = entry?.info?.role || "unknown";
    const text = extractPartsText(entry?.parts || []);
    if (!text) continue;
    blocks.push(`[${role}]\n${text}`);
  }

  return clipText(blocks.join("\n\n"), SUMMARY_TRANSCRIPT_MAX_CHARS);
}

function buildSummaryPrompt(transcript) {
  return [
    "You are generating a compact structured memory summary for a coding session.",
    "Return a JSON object with EXACT keys:",
    "request, investigated, learned, completed, next_steps, notes",
    "All values must be strings. Keep each field concise and factual.",
    "Do not include markdown outside JSON.",
    "",
    "Session transcript:",
    transcript || "(no transcript available)",
  ].join("\n");
}

const SUMMARY_KEYS = ["request", "investigated", "learned", "completed", "next_steps", "notes"];

function emptySummary() {
  return {
    request: "",
    investigated: "",
    learned: "",
    completed: "",
    next_steps: "",
    notes: "",
  };
}

function normalizeSummaryCandidate(candidate) {
  const result = emptySummary();
  if (!candidate || typeof candidate !== "object") return result;

  for (const key of SUMMARY_KEYS) {
    if (typeof candidate[key] === "string") {
      result[key] = candidate[key].trim();
    }
  }

  return result;
}

function parseJsonSummary(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  const candidates = [];
  const fencedJsonRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = fencedJsonRegex.exec(text);
  while (match) {
    if (match[1]) candidates.push(match[1].trim());
    match = fencedJsonRegex.exec(text);
  }
  candidates.push(text.trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const normalized = normalizeSummaryCandidate(parsed);
        if (Object.values(normalized).some(Boolean)) {
          return normalized;
        }
      }
    } catch {}
  }

  return null;
}

function sectionKeyFromLabel(rawLabel) {
  const label = String(rawLabel || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  if (!label) return null;
  if (label === "request" || label.includes("user request")) return "request";
  if (label === "investigated" || label.includes("analysis") || label.includes("investigation")) {
    return "investigated";
  }
  if (label === "learned" || label.includes("learning")) return "learned";
  if (label === "completed" || label.includes("done") || label.includes("finished")) {
    return "completed";
  }
  if (label === "next_steps" || label === "next steps" || label.includes("next step")) {
    return "next_steps";
  }
  if (label === "notes" || label.includes("note")) return "notes";
  return null;
}

function parseSectionSummary(text) {
  if (typeof text !== "string" || !text.trim()) return emptySummary();

  const result = emptySummary();
  const lines = text.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    const headingMatch = line.match(/^\s*([A-Za-z_ ]+)\s*:\s*(.*)$/);
    if (headingMatch) {
      const key = sectionKeyFromLabel(headingMatch[1]);
      if (key) {
        currentKey = key;
        const value = (headingMatch[2] || "").trim();
        if (value) {
          result[key] = result[key] ? `${result[key]}\n${value}` : value;
        }
        continue;
      }
    }

    if (currentKey) {
      const value = line.trim();
      if (value) {
        result[currentKey] = result[currentKey] ? `${result[currentKey]}\n${value}` : value;
      }
    }
  }

  return result;
}

function parseStructuredSummary(modelText) {
  const jsonSummary = parseJsonSummary(modelText);
  if (jsonSummary) return jsonSummary;

  const sectionSummary = parseSectionSummary(modelText);
  if (Object.values(sectionSummary).some(Boolean)) return sectionSummary;

  const fallback = emptySummary();
  fallback.notes = clipText(typeof modelText === "string" ? modelText.trim() : "", 4000);
  return fallback;
}

async function generateSummaryWithOpenCode(client, contentSessionId, modelConfig) {
  if (!client?.session) throw new Error("OpenCode client session API unavailable");

  const messagesResult = await client.session.messages({ path: { id: contentSessionId } });
  const messages = unwrapClientData(messagesResult);
  const transcript = buildSessionTranscript(messages);
  const prompt = buildSummaryPrompt(transcript);

  let summarySessionId = "";
  try {
    const createResult = await client.session.create({
      body: { title: `opencode-mem summary ${contentSessionId}` },
    });
    const summarySession = unwrapClientData(createResult);
    summarySessionId = summarySession?.id || "";
    if (!summarySessionId) throw new Error("Failed to create summary session");

    markInternalSession(summarySessionId);

    const body = {
      parts: [{ type: "text", text: prompt }],
    };
    if (modelConfig?.providerID && modelConfig?.modelID) {
      body.model = {
        providerID: modelConfig.providerID,
        modelID: modelConfig.modelID,
      };
    }

    const promptResult = await client.session.prompt({
      path: { id: summarySessionId },
      body,
    });
    const response = unwrapClientData(promptResult);
    const responseText = extractPartsText(response?.parts || []);
    return parseStructuredSummary(responseText);
  } finally {
    if (summarySessionId) {
      try {
        await client.session.delete({ path: { id: summarySessionId } });
      } catch {}
    }
  }
}

async function ingestSummary(contentSessionId, summary) {
  const response = await fetch(`${WORKER_BASE_URL}/api/sessions/summarize/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ contentSessionId, summary }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ingest failed (${response.status}): ${body}`);
  }

  return response.json().catch(() => ({}));
}

async function runWorkerSummarizeFallback(sessionID, cwd, pluginUrl) {
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
    safeLog("error", "summarize fallback failed", {
      sessionID,
      code: summarizeResult.code,
      stderr: summarizeResult.stderr,
    });
  }
}

export default async function OpenCodeMemPlugin(ctx) {
  const cwd = ctx?.directory || process.cwd();
  const pluginUrl = pathToFileURL(__filename).href;

  return {
    async "tool.execute.before"(input, output) {
      const sessionID = input?.sessionID || "unknown";
      if (isInternalSession(sessionID)) return;
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
      if (isInternalSession(sessionID)) return;
      const messageID = input?.messageID || "";
      const prompt = buildPromptText(output?.parts || []);

      if (
        input?.model &&
        typeof input.model.providerID === "string" &&
        typeof input.model.modelID === "string"
      ) {
        sessionModelCache.set(sessionID, {
          providerID: input.model.providerID,
          modelID: input.model.modelID,
          ts: nowMs(),
        });
      }

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
      if (isInternalSession(sessionID)) return;
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

      if (isInternalSession(sessionID)) return;

      if (stopLocks.get(sessionID)) return;
      const last = stopTimes.get(sessionID) || 0;
      if (nowMs() - last < STOP_DEBOUNCE_MS) return;

      stopLocks.set(sessionID, true);
      stopTimes.set(sessionID, nowMs());

      try {
        let shouldFallbackSummarize = false;

        try {
          const modelConfig = sessionModelCache.get(sessionID) || null;
          const summary = await generateSummaryWithOpenCode(ctx?.client, sessionID, modelConfig);
          await ingestSummary(sessionID, summary);
        } catch (err) {
          shouldFallbackSummarize = true;
          safeLog("error", "plugin-side summarize/ingest failed", {
            sessionID,
            error: safeError(err),
          });
        }

        if (shouldFallbackSummarize) {
          await runWorkerSummarizeFallback(sessionID, cwd, pluginUrl);
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
