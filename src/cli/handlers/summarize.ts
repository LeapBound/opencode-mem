/**
 * Summarize Handler - Stop
 *
 * Extracted from summary-hook.ts - sends summary request to worker.
 * Transcript parsing stays in the hook because only the hook has access to
 * the transcript file path.
 */

import type { EventHandler, NormalizedHookInput, HookResult } from '../types.js';
import { ensureWorkerRunning, getWorkerPort, fetchWithTimeout } from '../../shared/worker-utils.js';
import { logger } from '../../utils/logger.js';
import { extractLastMessage } from '../../shared/transcript-parser.js';
import { HOOK_EXIT_CODES, HOOK_TIMEOUTS, getTimeout } from '../../shared/hook-constants.js';

const SUMMARIZE_TIMEOUT_MS = getTimeout(HOOK_TIMEOUTS.DEFAULT);

export const summarizeHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    // Ensure worker is running before any other logic
    const workerReady = await ensureWorkerRunning();
    if (!workerReady) {
      // Worker not available - skip summary gracefully
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const { sessionId, transcriptPath } = input;

    const port = getWorkerPort();

    // Claude-compatible hooks provide transcript_path. Some OpenCode-native stop events do not.
    // In that case, request summarization without transcript-derived assistant text.
    const lastAssistantMessage = transcriptPath
      ? extractLastMessage(transcriptPath, 'assistant', true)
      : undefined;

    logger.dataIn('HOOK', 'Stop: Requesting summary', {
      workerPort: port,
      hasLastAssistantMessage: !!lastAssistantMessage
    });

    // Send to worker - worker handles privacy check and database operations
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${port}/api/sessions/summarize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentSessionId: sessionId,
          last_assistant_message: lastAssistantMessage
        }),
      },
      SUMMARIZE_TIMEOUT_MS
    );

    if (!response.ok) {
      // Return standard response even on failure (matches original behavior)
      return { continue: true, suppressOutput: true };
    }

    logger.debug('HOOK', 'Summary request sent successfully');

    return { continue: true, suppressOutput: true };
  }
};
