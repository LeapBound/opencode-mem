# Draft: OpenCode-Generated Summary -> Worker Ingest

## Goal
- Use OpenCode plugin hooks to generate session summaries via OpenCode's own model/agent, then send the summary to the opencode-mem worker for storage/search context.

## Contract (Plugin -> Worker)

### Endpoint
- Method: `POST`
- Path: `/api/sessions/summarize/ingest`
- Content-Type: `application/json`

### Payload (request body)
The plugin sends the OpenCode-generated summary as structured JSON aligned to `SummaryInput`.

```json
{
  "contentSessionId": "oc_sess_...",
  "summary": {
    "request": "...",
    "investigated": "...",
    "learned": "...",
    "completed": "...",
    "next_steps": "...",
    "notes": null
  }
}
```

### JSON contract (explicit)
Top-level object:

```ts
type SummaryIngestRequestBody = {
  contentSessionId: string;
  summary: SummaryInput;
};

// Must match `src/services/sqlite/summaries/types.ts` exactly.
type SummaryInput = {
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  next_steps: string;
  notes: string | null;
};
```

Notes on shape:
- Contract keys MUST be exactly: `request`, `investigated`, `learned`, `completed`, `next_steps`, `notes`.
- `summary` MUST be a plain object (not an array).
- Additional keys MAY be present for forward-compatibility; worker SHOULD ignore them.

## Validation Rules (simple + implementable)

### Required / types
- `contentSessionId`: required, string.
- `summary`: required, object.
- `summary.request|investigated|learned|completed|next_steps`: required, string.
- `summary.notes`: optional; if present must be `string` or `null`.

### Size limits (recommended)
These limits are intended to be easy to enforce at the HTTP boundary and protect storage/search.

- Max request JSON payload: 256 KiB.
- Max length per required summary field (`request|investigated|learned|completed|next_steps`): 16,000 chars each.
- Max length for `notes`: 16,000 chars.
- Allowed characters: any Unicode; newlines allowed; no HTML/Markdown restrictions.

### Normalization (recommended)
- Worker SHOULD store strings as-received (no rewriting) except optionally trimming trailing whitespace.
- Worker SHOULD coerce `notes: undefined` to `null` for storage.

## Responses

### Success: stored
```json
{
  "status": "stored",
  "sessionDbId": 123,
  "summaryId": 456,
  "promptNumber": 7
}
```

### Success: skipped (privacy)
If the latest user prompt for the session is entirely private (after privacy tag stripping), the worker does not store the summary.

```json
{ "status": "skipped", "reason": "private" }
```

## Error Cases

### 400 Bad Request
- Missing `contentSessionId`.
- Missing `summary` or `summary` is not an object.
- Invalid `summary` field types (any required field not a string; `notes` not `string|null`).

The worker returns a message suitable for logging/debugging (not a stable error code contract).

### 500 Internal Server Error
- Session lookup fails unexpectedly after idempotent session creation.
- Storage transaction fails.

## Backward Compatibility

- Existing worker-side summarization route remains supported:
  - `POST /api/sessions/summarize` with body `{ contentSessionId, last_assistant_message }` queues an LLM-generated summary inside the worker.
- The ingest route (`/api/sessions/summarize/ingest`) is additive and allows the plugin to bypass worker LLM usage (no OpenRouter dependence) by sending a pre-generated `SummaryInput` payload.

## Requirements (confirmed)
- Project naming is `opencode-mem` (avoid `claude-*` naming in our project/runtime).
- Do not read from `~/.claude/plugins` (avoid marketplace/claude plugin paths at runtime).
- Do not use OpenRouter.
- Prefer OpenAI `gpt-5.2` as the default model (as part of OpenCode config), but summary generation should ideally follow the user's OpenCode model config.
- Target a finished product (not an MVP).
- Communication: user prefers Chinese for planning discussion.

## Current State (as understood)
- Worker runs on port 37777 and exposes session endpoints (init/observation/summarize/session-complete).
- OpenCode plugin exists (`plugin/opencode-plugin.js`) and currently triggers worker summarization on `session.idle`.

## Key Decision Pending
- Summary generation source: use OpenCode (plugin/client) to generate the summary text, then POST it to worker.

## Open Questions
- Should the summary model be:
  - the same model/provider as the chat session (recommended), or
  - a dedicated separate model for summaries (cheaper/faster)?
- Summary format expectations (length + structure): short bullet summary vs longer narrative vs structured JSON.

## Scope Boundaries
- INCLUDE: plugin-side summarization + worker ingest path; end-to-end verification steps.
- EXCLUDE: any dependence on Claude marketplace plugin directories; OpenRouter-specific paths.
