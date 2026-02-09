import type { PlatformAdapter } from '../types.js';
import { claudeCodeAdapter } from './claude-code.js';

// Oh My OpenCode's `claude-code-hooks` compatibility layer produces Claude Code-compatible
// stdin payloads (snake_case fields like session_id, tool_name, tool_input, tool_response).
//
// Treat OpenCode/OMO as a Claude Code-compatible platform for hook ingestion.
export const opencodeAdapter: PlatformAdapter = claudeCodeAdapter;
