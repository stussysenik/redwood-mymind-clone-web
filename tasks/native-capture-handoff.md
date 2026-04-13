# native-capture — session handoff

**Branch:** `feat/native-capture` · **PR:** https://github.com/stussysenik/redwood-mymind-clone-web/pull/new/feat/native-capture
**Status:** code shipped, live HTTP gates green, visual + image + on-device verification still pending.
**Last touched:** 2026-04-13

## What's shipped on the branch (16 commits)

Backend:
- `ApiToken` Prisma model + SQL migration (`api/db/migrations/20260412232405_api_token/`)
- `apiTokens` service — `generateApiToken` / `verifyApiToken` / `revokeApiToken` / `listApiTokens` (TDD, 10 tests)
- `createCardForUser` extracted from `saveCard` so the serverless function can reuse it
- In-memory sliding-window rate limiter (`captureRateLimiter`, 6 tests)
- `/functions/capture` — Bearer auth, rate limit, URL/text/note, base64 image → R2 upload (21 tests)
- `apiTokens` GraphQL SDL + resolvers

Frontend:
- `MobileCaptureSection` component with GraphQL ops (5 tests)
- Mounted on `SettingsPage`
- `REDWOOD_ENV_BYOA_SHORTCUT_URL` added to `.env.example`

Tests:
- Playwright E2E: `web/tests/e2e/native-capture.spec.ts` (not run yet)
- Cypress smoke: `web/cypress/e2e/native-capture.cy.ts` (not run yet)

## Live verification evidence (run 2026-04-13 against local dev + shared Supabase)

| # | Gate | Result |
|---|---|---|
| 1 | `api_tokens` table exists in shared Supabase | ✅ |
| 2 | Mint real token via `generateApiToken` (attached to existing user `demo-user`) | ✅ |
| 3 | `POST /capture` URL payload → real card row | ✅ HTTP 200, cardId `f76f2cb8-85c7-4baa-b620-db31a80bc00c` |
| 4 | `POST /capture` text payload → real card row | ✅ HTTP 200, cardId `f07a7c42-8585-42ef-831a-6c6ec2a3142e` |
| 5 | `POST /capture` forged Bearer → rejected | ✅ HTTP 401 `invalid_token` |
| 6 | `POST /capture` no Bearer → rejected | ✅ HTTP 401 `invalid_token` |
| 7 | `/settings` page shell serves from `yarn rw dev` | ✅ HTTP 200 |
| 8 | `MobileCaptureSection` imported + rendered in `SettingsPage.tsx` | ✅ |
| 9 | Test token revoked after run | ✅ |

## Still NOT verified (do these next session)

1. **Image + R2 upload path** — local `.env` has no `R2_*` / `CLOUDFLARE_ACCOUNT_ID` vars, so the `imageBase64` branch would 500 with `r2 upload failed`. Must test on Railway where R2 is configured.
2. **Settings UI click-through** — Chrome DevTools MCP profile was locked by an already-running Chrome during the verification pass; no visual confirmation of the "Generate token" button, the copy-to-clipboard flow, or the list/revoke UI. Unit tests cover component rendering but not real click interactions.
3. **iOS Shortcut end-to-end** — needs a real device hitting the Railway-deployed `/capture` endpoint. Token has to be minted via the Settings page UI and pasted into the Shortcut.
4. **Playwright spec** (`web/tests/e2e/native-capture.spec.ts`) — never run; needs a live dev server + test user.
5. **Cypress spec** (`web/cypress/e2e/native-capture.cy.ts`) — never run; same prereq.

## How to resume

```sh
# 1. Start dev servers (web 8913, api 8912)
yarn rw dev

# 2. Mint a test token quickly (copy this mini-script into scripts/ if needed)
#    — or just click "Generate mobile capture token" in the Settings page UI.

# 3. Hit the endpoint
curl -sS -X POST http://localhost:8912/capture \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","note":"#smoke test"}'
# → {"ok":true,"cardId":"...","enriching":true}

# 4. Run the Playwright spec once Cypress/Playwright harness is stable
yarn playwright test web/tests/e2e/native-capture.spec.ts

# 5. Deploy and tail logs on Railway for iOS Shortcut verification
# Watch for: `capture ok` (success) and `r2 upload failed` (R2 env missing)
```

## Known gotchas picked up this session

- **Port 8910 is NOT BYOA** — it's a Perplexica Redwood dev server at `/Users/s3nik/Desktop/Perplexica/redwood`. Any mystery `/auth/github` CaseClauseError stacktrace came from Perplexica, not this repo. BYOA's own ports are **8912 (api)** and **8913 (web)** per `redwood.toml`.
- **Shared Supabase has pre-existing schema drift** from `api/db/schema.prisma` (DROP DEFAULT, SET NOT NULL, rename indexes, missing `cards.embedding vector(1536)` column). `yarn rw prisma db push` will try to "fix" this and likely fail on the `vector` type search_path. For this branch we used `yarn rw prisma db execute --file <migration.sql>` to apply *only* the ApiToken table creation surgically. Do the same if you add another migration — or properly baseline the whole DB in a separate focused effort.
- **No Prisma `User` model** — users live in Supabase `auth.users`. Scripts that mint tokens must resolve `userId` from an existing Card row or via a raw query against `auth.users`, not via `db.user.findFirst()`.
- **Parallel graph-agent work is live** — `GraphClient.tsx` / `GraphDetailPanel.tsx` / `GraphListView.tsx` plus `cards.ts` / `enrichment.ts` (`clearGraphCache` calls) and `openspec/changes/optimize-graph-view-rendering-performance/` are modified in the working tree but are NOT part of `feat/native-capture`. Leave them alone or coordinate before committing. Stash them by path before any commit on this branch: `git stash push -- <files>`.

## Known side-fix on this branch

While verifying, the web dev server threw a `[vite:css] @import must precede all other statements` error on `themes.css:472`. Root cause was in the theme compiler (`web/src/lib/themes/engine/compiler.ts`) — it inlined each theme's `@import` next to its selector block, so the second theme onward produced an illegal mid-file `@import`. Fixed by hoisting all font imports once at the top of the generated file (deduplicated across themes) and regenerated `web/src/lib/themes/generated/themes.css`. Both changes are committed on this branch.
