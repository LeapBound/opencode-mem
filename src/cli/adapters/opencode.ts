import type { HookResult, NormalizedHookInput, PlatformAdapter } from '../types.js';

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

// Oh My OpenCode can provide Claude-compatible payloads via `claude-code-hooks`,
// and some environments also emit OpenCode/Cursor-style payloads.
// Normalize both into the internal hook input shape.
export const opencodeAdapter: PlatformAdapter = {
  normalizeInput(raw: unknown): NormalizedHookInput {
    const r = (raw ?? {}) as any;
    const hookEvent = String(r.hook_event_name ?? '');

    const sessionId =
      r.session_id ??
      r.conversation_id ??
      r.generation_id ??
      r.session?.id ??
      'unknown';

    const cwd =
      r.cwd ??
      (Array.isArray(r.workspace_roots) ? r.workspace_roots[0] : undefined) ??
      process.cwd();

    const isShellExecution = hookEvent === 'afterShellExecution' || (!!r.command && !r.tool_name);
    const isMcpExecution = hookEvent === 'afterMCPExecution' || !!r.tool_name;

    const toolName =
      r.tool_name ??
      (isShellExecution ? 'Bash' : undefined);

    const toolInput =
      r.tool_input ??
      (isMcpExecution ? tryParseJson(r.tool_input) : undefined) ??
      (isShellExecution ? { command: r.command } : undefined);

    const toolResponse =
      r.tool_response ??
      (isMcpExecution ? tryParseJson(r.result_json) : undefined) ??
      (isShellExecution ? { output: r.output } : undefined);

    return {
      sessionId,
      cwd,
      prompt: r.prompt,
      toolName,
      toolInput,
      toolResponse,
      transcriptPath: r.transcript_path,
      filePath: r.file_path,
      edits: r.edits,
    };
  },
  formatOutput(result: HookResult): unknown {
    // For OMO's `claude-code-hooks` bridge:
    // - UserPromptSubmit: stdout is injected into the prompt (string), not parsed as JSON
    // - PostToolUse/Stop: stdout is treated as messages/warnings unless JSON-parsed
    //
    // So for OpenCode/OMO, stay silent unless we INTEND to inject context.
    if (result.hookSpecificOutput) {
      const ctx = (result.hookSpecificOutput.additionalContext ?? '').trim();
      if (!ctx) return '';
      return `<claude-mem-context>\n${ctx}\n</claude-mem-context>`;
    }

    // Default: no stdout (prevents polluting tool output / prompt)
    return undefined;
  }
};
