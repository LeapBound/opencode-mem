/**
 * Default settings values for Claude Memory
 * Shared across UI components and hooks
 */
export const DEFAULT_SETTINGS = {
  OPENCODE_MEM_MODEL: 'claude-sonnet-4-5',
  OPENCODE_MEM_CONTEXT_OBSERVATIONS: '50',
  OPENCODE_MEM_WORKER_PORT: '37777',
  OPENCODE_MEM_WORKER_HOST: '127.0.0.1',

  // AI Provider Configuration
  OPENCODE_MEM_PROVIDER: 'claude',
  OPENCODE_MEM_GEMINI_API_KEY: '',
  OPENCODE_MEM_GEMINI_MODEL: 'gemini-2.5-flash-lite',
  OPENCODE_MEM_OPENROUTER_API_KEY: '',
  OPENCODE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',
  OPENCODE_MEM_OPENROUTER_SITE_URL: '',
  OPENCODE_MEM_OPENROUTER_APP_NAME: 'opencode-mem',
  OPENCODE_MEM_GEMINI_RATE_LIMITING_ENABLED: 'true',

  // Token Economics (all true for backwards compatibility)
  OPENCODE_MEM_CONTEXT_SHOW_READ_TOKENS: 'true',
  OPENCODE_MEM_CONTEXT_SHOW_WORK_TOKENS: 'true',
  OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT: 'true',
  OPENCODE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT: 'true',

  // Observation Filtering (all types and concepts)
  OPENCODE_MEM_CONTEXT_OBSERVATION_TYPES: 'bugfix,feature,refactor,discovery,decision,change',
  OPENCODE_MEM_CONTEXT_OBSERVATION_CONCEPTS: 'how-it-works,why-it-exists,what-changed,problem-solution,gotcha,pattern,trade-off',

  // Display Configuration
  OPENCODE_MEM_CONTEXT_FULL_COUNT: '5',
  OPENCODE_MEM_CONTEXT_FULL_FIELD: 'narrative',
  OPENCODE_MEM_CONTEXT_SESSION_COUNT: '10',

  // Feature Toggles
  OPENCODE_MEM_CONTEXT_SHOW_LAST_SUMMARY: 'true',
  OPENCODE_MEM_CONTEXT_SHOW_LAST_MESSAGE: 'false',

  // Exclusion Settings
  OPENCODE_MEM_EXCLUDED_PROJECTS: '',
  OPENCODE_MEM_FOLDER_MD_EXCLUDE: '[]',
} as const;
