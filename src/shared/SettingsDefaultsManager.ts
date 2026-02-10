/**
 * SettingsDefaultsManager
 *
 * Single source of truth for all default configuration values.
 * Provides methods to get defaults with optional environment variable overrides.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { DEFAULT_OBSERVATION_TYPES_STRING, DEFAULT_OBSERVATION_CONCEPTS_STRING } from '../constants/observation-metadata.js';
// NOTE: Do NOT import logger here - it creates a circular dependency
// logger.ts depends on SettingsDefaultsManager for its initialization

const DEFAULT_DATA_DIR = join(homedir(), '.opencode-mem');
const DEFAULT_SETTINGS_PATH = join(DEFAULT_DATA_DIR, 'settings.json');

export interface SettingsDefaults {
  OPENCODE_MEM_MODEL: string;
  OPENCODE_MEM_CONTEXT_OBSERVATIONS: string;
  OPENCODE_MEM_WORKER_PORT: string;
  OPENCODE_MEM_WORKER_HOST: string;
  OPENCODE_MEM_SKIP_TOOLS: string;
  // AI Provider Configuration
  OPENCODE_MEM_PROVIDER: string;  // 'claude' | 'gemini' | 'openrouter'
  OPENCODE_MEM_CLAUDE_AUTH_METHOD: string;  // 'cli' | 'api' - how Claude provider authenticates
  OPENCODE_MEM_GEMINI_API_KEY: string;
  OPENCODE_MEM_GEMINI_MODEL: string;  // 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-3-flash-preview'
  OPENCODE_MEM_GEMINI_RATE_LIMITING_ENABLED: string;  // 'true' | 'false' - enable rate limiting for free tier
  OPENCODE_MEM_OPENROUTER_API_KEY: string;
  OPENCODE_MEM_OPENROUTER_MODEL: string;
  OPENCODE_MEM_OPENROUTER_SITE_URL: string;
  OPENCODE_MEM_OPENROUTER_APP_NAME: string;
  OPENCODE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES: string;
  OPENCODE_MEM_OPENROUTER_MAX_TOKENS: string;
  // System Configuration
  OPENCODE_MEM_DATA_DIR: string;
  OPENCODE_MEM_LOG_LEVEL: string;
  OPENCODE_MEM_PYTHON_VERSION: string;
  CLAUDE_CODE_PATH: string;
  OPENCODE_MEM_MODE: string;
  // Token Economics
  OPENCODE_MEM_CONTEXT_SHOW_READ_TOKENS: string;
  OPENCODE_MEM_CONTEXT_SHOW_WORK_TOKENS: string;
  OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: string;
  OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: string;
  // Observation Filtering
  OPENCODE_MEM_CONTEXT_OBSERVATION_TYPES: string;
  OPENCODE_MEM_CONTEXT_OBSERVATION_CONCEPTS: string;
  // Display Configuration
  OPENCODE_MEM_CONTEXT_FULL_COUNT: string;
  OPENCODE_MEM_CONTEXT_FULL_FIELD: string;
  OPENCODE_MEM_CONTEXT_SESSION_COUNT: string;
  // Feature Toggles
  OPENCODE_MEM_CONTEXT_SHOW_LAST_SUMMARY: string;
  OPENCODE_MEM_CONTEXT_SHOW_LAST_MESSAGE: string;
  OPENCODE_MEM_FOLDER_CLAUDEMD_ENABLED: string;
  // Exclusion Settings
  OPENCODE_MEM_EXCLUDED_PROJECTS: string;  // Comma-separated glob patterns for excluded project paths
  OPENCODE_MEM_FOLDER_MD_EXCLUDE: string;  // JSON array of folder paths to exclude from CLAUDE.md generation
}

export class SettingsDefaultsManager {
  /**
   * Default values for all settings
   */
  private static readonly DEFAULTS: SettingsDefaults = {
    OPENCODE_MEM_MODEL: 'claude-sonnet-4-5',
    OPENCODE_MEM_CONTEXT_OBSERVATIONS: '50',
    OPENCODE_MEM_WORKER_PORT: '37777',
    OPENCODE_MEM_WORKER_HOST: '127.0.0.1',
    OPENCODE_MEM_SKIP_TOOLS: 'ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion',
    // AI Provider Configuration
    OPENCODE_MEM_PROVIDER: 'claude',  // Default to Claude
    OPENCODE_MEM_CLAUDE_AUTH_METHOD: 'cli',  // Default to CLI subscription billing (not API key)
    OPENCODE_MEM_GEMINI_API_KEY: '',  // Empty by default, can be set via UI or env
    OPENCODE_MEM_GEMINI_MODEL: 'gemini-2.5-flash-lite',  // Default Gemini model (highest free tier RPM)
    OPENCODE_MEM_GEMINI_RATE_LIMITING_ENABLED: 'true',  // Rate limiting ON by default for free tier users
    OPENCODE_MEM_OPENROUTER_API_KEY: '',  // Empty by default, can be set via UI or env
    OPENCODE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',  // Default OpenRouter model (free tier)
    OPENCODE_MEM_OPENROUTER_SITE_URL: '',  // Optional: for OpenRouter analytics
    OPENCODE_MEM_OPENROUTER_APP_NAME: 'opencode-mem',  // App name for OpenRouter analytics
    OPENCODE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES: '20',  // Max messages in context window
    OPENCODE_MEM_OPENROUTER_MAX_TOKENS: '100000',  // Max estimated tokens (~100k safety limit)
    // System Configuration
    OPENCODE_MEM_DATA_DIR: join(homedir(), '.opencode-mem'),
    OPENCODE_MEM_LOG_LEVEL: 'INFO',
    OPENCODE_MEM_PYTHON_VERSION: '3.13',
    CLAUDE_CODE_PATH: '', // Empty means auto-detect via 'which claude'
    OPENCODE_MEM_MODE: 'code', // Default mode profile
    // Token Economics
    OPENCODE_MEM_CONTEXT_SHOW_READ_TOKENS: 'true',
    OPENCODE_MEM_CONTEXT_SHOW_WORK_TOKENS: 'true',
    OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: 'true',
    OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: 'true',
    // Observation Filtering
    OPENCODE_MEM_CONTEXT_OBSERVATION_TYPES: DEFAULT_OBSERVATION_TYPES_STRING,
    OPENCODE_MEM_CONTEXT_OBSERVATION_CONCEPTS: DEFAULT_OBSERVATION_CONCEPTS_STRING,
    // Display Configuration
    OPENCODE_MEM_CONTEXT_FULL_COUNT: '5',
    OPENCODE_MEM_CONTEXT_FULL_FIELD: 'narrative',
    OPENCODE_MEM_CONTEXT_SESSION_COUNT: '10',
    // Feature Toggles
    OPENCODE_MEM_CONTEXT_SHOW_LAST_SUMMARY: 'true',
    OPENCODE_MEM_CONTEXT_SHOW_LAST_MESSAGE: 'false',
    OPENCODE_MEM_FOLDER_CLAUDEMD_ENABLED: 'false',
    // Exclusion Settings
    OPENCODE_MEM_EXCLUDED_PROJECTS: '',  // Comma-separated glob patterns for excluded project paths
    OPENCODE_MEM_FOLDER_MD_EXCLUDE: '[]',  // JSON array of folder paths to exclude from CLAUDE.md generation
  };

  /**
   * Get all defaults as an object
   */
  static getAllDefaults(): SettingsDefaults {
    return { ...this.DEFAULTS };
  }

  /**
   * Get a default value from defaults (no environment variable override)
   */
  static get(key: keyof SettingsDefaults): string {
    if (key === 'OPENCODE_MEM_DATA_DIR') {
      return this.resolveDataDir();
    }
    return this.DEFAULTS[key];
  }

  /**
   * Resolve data directory with bootstrap-safe priority:
   *   1) Environment variable
   *   2) Legacy default settings file (~/.opencode-mem/settings.json)
   *   3) Built-in default
   */
  private static resolveDataDir(): string {
    const fromEnv = process.env.OPENCODE_MEM_DATA_DIR;
    if (fromEnv && fromEnv.trim()) {
      return fromEnv.trim();
    }

    try {
      if (existsSync(DEFAULT_SETTINGS_PATH)) {
        const settingsData = readFileSync(DEFAULT_SETTINGS_PATH, 'utf-8');
        const parsed = JSON.parse(settingsData) as Partial<SettingsDefaults>;
        const fromFile = parsed.OPENCODE_MEM_DATA_DIR;
        if (typeof fromFile === 'string' && fromFile.trim()) {
          return fromFile.trim();
        }
      }
    } catch {
      // Ignore parse/read failures and fall back to defaults
    }

    return this.DEFAULTS.OPENCODE_MEM_DATA_DIR;
  }

  /**
   * Get an integer default value
   */
  static getInt(key: keyof SettingsDefaults): number {
    const value = this.get(key);
    return parseInt(value, 10);
  }

  /**
   * Get a boolean default value
   * Handles both string 'true' and boolean true from JSON
   */
  static getBool(key: keyof SettingsDefaults): boolean {
    const value = this.get(key);
    return value === 'true';
  }

  /**
   * Apply environment variable overrides to settings
   * Environment variables take highest priority over file and defaults
   */
  private static applyEnvOverrides(settings: SettingsDefaults): SettingsDefaults {
    const result = { ...settings };
    for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
      if (process.env[key] !== undefined) {
        result[key] = process.env[key]!;
      }
    }
    return result;
  }

  /**
   * Load settings from file with fallback to defaults
   * Returns merged settings with proper priority: process.env > settings file > defaults
   * Handles all errors (missing file, corrupted JSON, permissions) gracefully
   *
   * Configuration Priority:
   *   1. Environment variables (highest priority)
   *   2. Settings file (~/.opencode-mem/settings.json)
   *   3. Default values (lowest priority)
   */
  static loadFromFile(settingsPath: string): SettingsDefaults {
    try {
      if (!existsSync(settingsPath)) {
        const defaults = this.getAllDefaults();
        try {
          const dir = dirname(settingsPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
          // Use console instead of logger to avoid circular dependency
          process.stderr.write(`[SETTINGS] Created settings file with defaults: ${settingsPath}\n`);
        } catch (error) {
          console.warn('[SETTINGS] Failed to create settings file, using in-memory defaults:', settingsPath, error);
        }
        // Still apply env var overrides even when file doesn't exist
        return this.applyEnvOverrides(defaults);
      }

      const settingsData = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // MIGRATION: Handle old nested schema { env: {...} }
      let flatSettings = settings;
      if (settings.env && typeof settings.env === 'object') {
        // Migrate from nested to flat schema
        flatSettings = settings.env;

        // Auto-migrate the file to flat schema
        try {
          writeFileSync(settingsPath, JSON.stringify(flatSettings, null, 2), 'utf-8');
          process.stderr.write(`[SETTINGS] Migrated settings file from nested to flat schema: ${settingsPath}\n`);
        } catch (error) {
          console.warn('[SETTINGS] Failed to auto-migrate settings file:', settingsPath, error);
          // Continue with in-memory migration even if write fails
        }
      }

      // Merge file settings with defaults (flat schema)
      const result: SettingsDefaults = { ...this.DEFAULTS };
      for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
        if (flatSettings[key] !== undefined) {
          result[key] = flatSettings[key];
        }
      }

      // Apply environment variable overrides (highest priority)
      return this.applyEnvOverrides(result);
    } catch (error) {
      console.warn('[SETTINGS] Failed to load settings, using defaults:', settingsPath, error);
      // Still apply env var overrides even on error
      return this.applyEnvOverrides(this.getAllDefaults());
    }
  }
}
