# Draft: OpenCode Summary → Worker Ingest (Next Steps)

## Current State (from session recap)
- OpenCode-side summary generation implemented in `plugin/opencode-plugin.js` and ingested to worker via `POST /api/sessions/summarize/ingest`.
- Recursion/noise mitigated via internal-session guard + TTL.
- Worker ingest endpoint already exists in `src/services/worker/http/routes/SessionRoutes.ts`.
- Integration tests updated/added in `tests/integration/worker-api-endpoints.test.ts`.
- Docs updated in `docs/opencode-setup.md`.
- Local smoke verified after worker restart.

## Next Steps (to decide)
1. Decide git hygiene + what to commit
   - Whether to commit build artifacts (e.g. `plugin/scripts/worker-service.cjs`) per repo convention
   - Whether to commit any `.sisyphus/*` artifacts (usually plans/drafts are not committed; confirm)
2. Fix Sisyphus state mismatch
   - Update `.sisyphus/boulder.json` to point to `.sisyphus/plans/opencode-mem-opencode-summary.md` (currently points to old plan)
3. Final verification checklist to run before pushing
   - `npm run -s build`
   - `npm test` (or the repo’s standard test suite)
   - Worker restart + curl smoke for ingest + confirm `/api/context/recent` shows new summary

## Open Questions
- Commit scope: do we include `plugin/scripts/worker-service.cjs`?
- Should `.sisyphus/plans/*.md` be committed, or kept local-only?
- Do you want a single atomic commit, or split commits (plugin vs tests vs docs)?

## Decisions (confirmed)
- Commit grouping: split commits (plugin vs tests vs docs).
- Build artifacts: do NOT commit generated/build artifacts (e.g. `plugin/scripts/worker-service.cjs`).
- `.sisyphus/*`: YES commit planning files.

## Decisions (clarified)
- `.sisyphus` scope: commit plans + drafts + notepads.

## Ambiguity to resolve
- Resolved: commit plans + drafts + notepads.
