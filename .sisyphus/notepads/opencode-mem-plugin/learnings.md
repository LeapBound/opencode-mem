
2026-02-10
- OpenCode plugin hook typings source of truth: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/plugin/src/index.ts
- Key hooks used by opencode-mem plugin: `chat.message`, `tool.execute.before`, `tool.execute.after`, `event` with `session.idle`.
- `context` hook output for platform=opencode is wrapped by `src/cli/adapters/opencode.ts` in `<opencode-mem-context>...</opencode-mem-context>`; plugin must unwrap before injecting into `output.parts`.
- Plugin manager write-safety: backup-on-first-mutation + atomic temp-write + stable stringify comparison for idempotency.
