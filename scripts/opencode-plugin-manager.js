#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const USER_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, "opencode.json");
const USER_CONFIG_PATH_JSONC = path.join(USER_CONFIG_DIR, "opencode.jsonc");
const PROJECT_CONFIG_PATH = path.join(REPO_ROOT, ".opencode", "opencode.json");
const PROJECT_CONFIG_PATH_JSONC = path.join(REPO_ROOT, ".opencode", "opencode.jsonc");
const OMO_CONFIG_PATH = path.join(USER_CONFIG_DIR, "oh-my-opencode.json");
const OMO_CONFIG_PATH_JSONC = path.join(USER_CONFIG_DIR, "oh-my-opencode.jsonc");

const LOCAL_PLUGIN_FILE = path.join(REPO_ROOT, "plugin", "opencode-plugin.js");
const LOCAL_PLUGIN_URL = pathToFileURL(LOCAL_PLUGIN_FILE).href;
const PACKAGE_PLUGIN_NAME = "opencode-mem";

const LEGACY_HOOK_MARKERS = [
  "hook opencode context",
  "hook opencode session-init",
  "hook opencode observation",
  "hook opencode summarize",
  "hook opencode session-complete",
];

const BACKUP_SUFFIX_PREFIX = ".bak-";
const backedUpPaths = new Set();

function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function readJsonLike(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf-8");
  const cleaned = stripJsonComments(raw).trim();
  if (!cleaned) return {};
  return JSON.parse(cleaned);
}

function formatTimestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function stableStringify(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";
  if (t !== "object") return "null";
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

function ensureBackupBeforeMutation(filePath) {
  if (backedUpPaths.has(filePath)) return;
  if (!fs.existsSync(filePath)) {
    backedUpPaths.add(filePath);
    return;
  }

  const ts = formatTimestampForFilename();
  const backupPath = `${filePath}${BACKUP_SUFFIX_PREFIX}${ts}`;
  fs.copyFileSync(filePath, backupPath);
  backedUpPaths.add(filePath);
}

function atomicWriteFileSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const ts = formatTimestampForFilename();
  const tmpPath = `${filePath}.tmp-${process.pid}-${ts}`;
  fs.writeFileSync(tmpPath, content, "utf-8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Windows may not allow renaming over an existing file.
    if (err && (err.code === "EEXIST" || err.code === "EPERM" || err.code === "EACCES")) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
      fs.renameSync(tmpPath, filePath);
      return;
    }
    throw err;
  }
}

function writeJsonIfChanged(filePath, nextObj) {
  const prevObj = readJsonLike(filePath);
  const prevStable = stableStringify(prevObj);
  const nextStable = stableStringify(nextObj);
  if (prevStable === nextStable) return { wrote: false, changed: false };

  ensureBackupBeforeMutation(filePath);
  const content = `${JSON.stringify(nextObj, null, 2)}\n`;
  atomicWriteFileSync(filePath, content);
  return { wrote: true, changed: true };
}

function getConfigPath(mode) {
  if (mode === "project") {
    if (fs.existsSync(PROJECT_CONFIG_PATH_JSONC)) return PROJECT_CONFIG_PATH_JSONC;
    return PROJECT_CONFIG_PATH;
  }
  if (fs.existsSync(USER_CONFIG_PATH_JSONC)) return USER_CONFIG_PATH_JSONC;
  return USER_CONFIG_PATH;
}

function detectPluginEntry(preferPackage = false) {
  if (!preferPackage && fs.existsSync(LOCAL_PLUGIN_FILE)) {
    return LOCAL_PLUGIN_URL;
  }
  return PACKAGE_PLUGIN_NAME;
}

function normalizePluginArray(config) {
  if (!Array.isArray(config.plugin)) {
    config.plugin = [];
  }
  return config.plugin;
}

function removeLegacyHookCommandsFromOmoConfig() {
  const omoConfigPath = fs.existsSync(OMO_CONFIG_PATH_JSONC) ? OMO_CONFIG_PATH_JSONC : OMO_CONFIG_PATH;
  if (!fs.existsSync(omoConfigPath)) {
    return { modified: false, removedCommands: 0, disabledClaudeCodeHooks: false };
  }

  const config = readJsonLike(omoConfigPath);
  let removedCommands = 0;

  if (config.hooks && typeof config.hooks === "object") {
    for (const eventName of Object.keys(config.hooks)) {
      const matchers = config.hooks[eventName];
      if (!Array.isArray(matchers)) continue;

      for (const matcher of matchers) {
        if (!Array.isArray(matcher?.hooks)) continue;
        const before = matcher.hooks.length;
        matcher.hooks = matcher.hooks.filter((h) => {
          if (!h || h.type !== "command" || typeof h.command !== "string") return true;
          return !LEGACY_HOOK_MARKERS.some((marker) => h.command.includes(marker));
        });
        removedCommands += before - matcher.hooks.length;
      }
    }
  }

  if (!Array.isArray(config.disabled_hooks)) {
    config.disabled_hooks = [];
  }
  const hadClaudeCodeHooksDisabled = config.disabled_hooks.includes("claude-code-hooks");
  if (!hadClaudeCodeHooksDisabled) {
    config.disabled_hooks.push("claude-code-hooks");
  }

  if (removedCommands > 0 || !hadClaudeCodeHooksDisabled) {
    writeJsonIfChanged(omoConfigPath, config);
    return {
      modified: true,
      removedCommands,
      disabledClaudeCodeHooks: !hadClaudeCodeHooksDisabled,
    };
  }

  return { modified: false, removedCommands: 0, disabledClaudeCodeHooks: false };
}

function install({ mode, preferPackage }) {
  const configPath = getConfigPath(mode);
  const config = readJsonLike(configPath);
  const plugins = normalizePluginArray(config);
  const entry = detectPluginEntry(preferPackage);

  const alreadyPresent = plugins.includes(entry);
  if (!alreadyPresent) {
    plugins.push(entry);
  }

  const writeResult = writeJsonIfChanged(configPath, config);
  const cleanup = removeLegacyHookCommandsFromOmoConfig();

  console.log(JSON.stringify({
    action: "install",
    configPath,
    pluginEntry: entry,
    alreadyPresent,
    wroteConfig: writeResult.wrote,
    legacyCleanup: cleanup,
  }, null, 2));
}

function uninstall({ mode }) {
  const configPath = getConfigPath(mode);
  const config = readJsonLike(configPath);
  const plugins = normalizePluginArray(config);

  const before = plugins.length;
  config.plugin = plugins.filter((entry) => entry !== PACKAGE_PLUGIN_NAME && entry !== LOCAL_PLUGIN_URL);
  const removed = before - config.plugin.length;

  const writeResult = writeJsonIfChanged(configPath, config);

  console.log(JSON.stringify({
    action: "uninstall",
    configPath,
    removed,
    wroteConfig: writeResult.wrote,
  }, null, 2));
}

function status({ mode }) {
  const configPath = getConfigPath(mode);
  const config = readJsonLike(configPath);
  const plugins = normalizePluginArray(config);

  const hasPackageEntry = plugins.includes(PACKAGE_PLUGIN_NAME);
  const hasLocalEntry = plugins.includes(LOCAL_PLUGIN_URL);

  let hasLegacyHooks = false;
  const omoConfigPath = fs.existsSync(OMO_CONFIG_PATH_JSONC) ? OMO_CONFIG_PATH_JSONC : OMO_CONFIG_PATH;
  if (fs.existsSync(omoConfigPath)) {
    const omo = readJsonLike(omoConfigPath);
    const text = JSON.stringify(omo);
    hasLegacyHooks = LEGACY_HOOK_MARKERS.some((marker) => text.includes(marker));
  }

  console.log(JSON.stringify({
    action: "status",
    configPath,
    pluginEntries: plugins,
    hasPackageEntry,
    hasLocalEntry,
    legacyHooksDetected: hasLegacyHooks,
    localPluginFileExists: fs.existsSync(LOCAL_PLUGIN_FILE),
  }, null, 2));
}

function printConfig({ preferPackage }) {
  const entry = detectPluginEntry(preferPackage);
  console.log(JSON.stringify({ plugin: [entry] }, null, 2));
}

function parseArgs(argv) {
  const args = new Set(argv.slice(3));
  const command = argv[2] || "status";
  const mode = args.has("--project") ? "project" : "user";
  const preferPackage = args.has("--package");
  return { command, mode, preferPackage };
}

function main() {
  const { command, mode, preferPackage } = parseArgs(process.argv);

  if (command === "install") return install({ mode, preferPackage });
  if (command === "uninstall") return uninstall({ mode });
  if (command === "status") return status({ mode });
  if (command === "print") return printConfig({ preferPackage });

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main();
