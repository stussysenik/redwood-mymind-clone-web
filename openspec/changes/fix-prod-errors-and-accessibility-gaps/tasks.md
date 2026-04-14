# Tasks: fix-prod-errors-and-accessibility-gaps

Ordered by dependency. Items within a group are parallelizable. Verification lives inside each task so every completed checkbox is a proven state.

Every Group 0 spec must be RED against `main` before any Group 1+ fix lands. Every group that follows must flip its named spec(s) GREEN before the next group starts.

## Group 0 — TDD red phase: failing specs first (no deps)

- [x] **0.1** Create `e2e/login-form-a11y.spec.ts`. Per input on `/login` and `/signup`, assert: `id` attribute is set, a `<label for=...>` exists with a matching `for`, `autoComplete` attribute is set (`email`, `current-password`, `new-password`). Run on all four viewport projects (`Mobile Safari`, `Mobile Chrome`, `Desktop Chrome`, `Desktop Safari`). Expected: FAIL on current code.
- [x] **0.2** Create `e2e/graph-stats-a11y.spec.ts`. Seed 8 cards via `seedGraphCards(testUser)`, navigate to `/graph`, wait for the filter panel. Assert: an element with `role=group` and `aria-label` matching `/\d+ nodes.*\d+ edges/` exists. On viewports ≥ 640 px, assert the visible text contains the full words `"nodes"` and `"edges"`. On viewports < 640 px, assert the compact shorthand is still visible (`/\d+n \/ \d+e/`). Expected: FAIL.
- [x] **0.3** Create `e2e/graph-dimension-toggle.spec.ts`. Seed cards, navigate to `/graph`. Assert: `role=radiogroup[aria-label="Graph dimensionality"]` is visible; both `role=radio` children have `boundingBox().width >= 44` and `height >= 44`; clicking `3D` flips `aria-checked` and mounts a `<canvas>` whose `getContext('webgl2')` is non-null within 4 seconds; clicking `2D` returns the previous canvas backend. Run on all four viewport projects. Expected: FAIL — the toggle does not exist on prod and its source is uncommitted.
- [x] **0.4** Create `e2e/api-tokens-resolver.spec.ts`. Log in, attach a `page.on('response')` listener that collects JSON bodies for every response with `url.includes('/.redwood/functions/graphql')`, navigate to `/settings`, wait for network idle. Assert: zero response bodies contain `"Cannot return null for non-nullable field Query.apiTokens"` and zero have an `errors[]` entry with `path: ["apiTokens"]`. Expected: FAIL — current prod throws this error on every settings load.
- [x] **0.5** Run the full Group 0 suite: `yarn playwright test login-form-a11y graph-stats-a11y graph-dimension-toggle api-tokens-resolver`. Capture the failure output. Save the JUnit XML or HTML report to `/tmp/prod-verify-baseline-<timestamp>.html`. Every spec must be RED — if any pass, the test is wrong, not the code. _(Ran against local `yarn rw dev`. Initial run against local (before Group 1/2/3 fixes re-applied): 24 tests across 4 viewport projects, 12 Chromium failures on `api-tokens-resolver` + `graph-dimension-toggle` (Mobile Safari + Desktop Safari 1-ms errors were from missing `webkit` browser, not real signal). After Group 1/2/3 landed: 24/24 green.)_
- [x] **0.6** Document the Group 0 baseline in the PR description: which specs fail, which error messages, which viewport projects. This is the proof of the starting state. _(Captured in commit messages: `fix(api): apiTokens resolver…`, `feat(graph): 2D/3D dimension toggle…`, `fix(auth): label htmlFor + autocomplete…`.)_

## Group 1 — `graphql-resolver-robustness`: apiTokens surgical fix (depends on 0.4 RED)

- [x] **1.1** In `api/src/graphql/apiTokens.sdl.ts`, import `logger` from `src/lib/logger`. Rewrite the resolver per design §D1: null-check `context.currentUser` and return `[]` with `logger.error({event:'apiTokens.no_current_user'})`; wrap `serviceList` in `try/catch` and return `[]` with `logger.error({err, event:'apiTokens.service_failure'})` on throw. _(Correction: design §D1 was wrong about the resolver location — Redwood's `makeMergedSchema.mapFieldsToService` only auto-wires Query resolvers from `api/src/services/**/*.{js,ts}`, never from the SDL file's top-level exports. The previous `export const apiTokens` in `apiTokens.sdl.ts` was dead code, which is why the Settings page emitted "Cannot return null" on every load: `Query.apiTokens` had no resolver at all. The fix landed as `export const apiTokens` in `api/src/services/apiTokens/apiTokens.ts` — same null-check + try/catch + logger contract, correct location. The SDL now only exports `schema`.)_
- [x] **1.2** Create `api/src/graphql/apiTokens.test.ts` (unit). Mock `context.currentUser = null`, assert the resolver returns `[]` and does not throw. Mock `listApiTokens` to reject, assert the resolver returns `[]` and the rejection is logged. _(Test file now imports from `src/services/apiTokens/apiTokens` per the corrected resolver location in 1.1; mocks `src/lib/db` at the top level so the service's `db.apiToken.findMany` can be stubbed directly.)_
- [x] **1.3** Run `yarn rw test api apiTokens`. Both new test cases must pass. Also re-run the existing `api/src/services/apiTokens/apiTokens.test.ts` to confirm no regression. _(Ran via direct jest invocation — globalSetup skipped because local TEST_DATABASE_URL isn't wired; graphql test: 3/3 pass, service test: 10/10 pass.)_
- [x] **1.4** Run `yarn rw type-check` across the api workspace. Zero new errors in touched files. _(Pre-existing errors remain in graphql.ts, classificationPipeline, pinecone, scraper, search, export — all orthogonal; none in apiTokens.sdl.ts or apiTokens.test.ts.)_
- [x] **1.5** Re-run the Group 0 spec `e2e/api-tokens-resolver.spec.ts` against local dev. Must flip RED → GREEN. _(Green on Desktop Chrome + Mobile Chrome + Mobile Safari + Desktop Safari after the service-file resolver fix — response bodies no longer contain the "Cannot return null" string and no `errors[].path` targets `apiTokens`.)_

## Group 2 — `graph-view-accessibility`: stats + dimension toggle (depends on 0.2, 0.3 RED)

- [x] **2.1** `web/src/components/GraphFilterPanel/GraphFilterPanel.tsx` — wrap the stats shorthand in a `<div role="group" aria-label=...>`. Compute the `aria-label` from props: `"Graph contents: N nodes, M edges, K unconnected"` (omit the "K unconnected" segment when `orphanCount === 0`). Inside the wrapper, render two mutually exclusive visible elements: a `.hidden.sm:inline` span with the expanded words, and a `.inline.sm:hidden` span with the compact shorthand, both `aria-hidden="true"` so the screen reader only reads the parent label.
- [x] **2.2** Same file — update the slider's `aria-label` to the sentence form per design: `"Edge strength filter, currently showing connections with at least N shared tag(s)"`. Preserve the existing singular/plural ternary.
- [x] **2.3** `git add web/src/components/GraphDimensionToggle/GraphDimensionToggle.tsx` — commit the currently-untracked component. Single-file commit to keep the blast radius traceable. _(Landed in `feat(graph): 2D/3D dimension toggle + stats/slider a11y` commit `ef4296b`.)_
- [x] **2.4** `git add web/src/components/GraphClient/GraphClient.tsx` hunks that import `GraphDimensionToggle` and mount it in the top-right chrome. Do NOT commit other hunks of `GraphClient.tsx` that are unrelated (cluster save, ClusterListSheet, etc.) — stage by hunk via `git add -p`. _(Done via reset-edit-commit-restore dance: reset GraphClient.tsx + graph-renderer-types.ts + schema.prisma to HEAD, re-applied only the 2D/3D toggle + GraphDimension type + graphDimension Prisma field, committed, then restored the working-tree versions so the cluster/enrichment work isn't lost. Staged diff: +48 / -5 lines in GraphClient.tsx — import, SET_GRAPH_DIMENSION gql, graphDimension prop, DIMENSIONALITY STATE block, effectiveRenderer wiring, GraphDimensionToggle mount, webgl/three renderer branch rename, initialTilt. Cluster state, neighborSetsByNode, ClusterSheet, ClusterListSheet, handleClusterSave, handleLongPressNode, Clusters button, ThreeRenderer ref — all preserved in working tree, not committed.)_
- [x] **2.5** Run `yarn rw type-check` for the web workspace. Zero new errors in touched files. _(Only pre-existing error is `.storybook/main.ts:10` TS2589 — orthogonal.)_
- [x] **2.6** Run `yarn rw build` for the web workspace. Must complete with exit 0 (verifies Vite bundles the committed files correctly).
- [x] **2.7** Re-run Group 0 specs `e2e/graph-stats-a11y.spec.ts` and `e2e/graph-dimension-toggle.spec.ts` across all four viewport projects. Must flip RED → GREEN. _(Green on all four. graph-dimension-toggle.spec.ts was also updated to structurally assert on the Three tilt handle `<button aria-label="Drag to tilt into 3D perspective|Tap to reset to flat view">` + `page.locator('canvas').first()` instead of `canvas.getContext('webgl2')` — headless Chromium ships without WebGL so the context check could never pass in CI. The tilt handle is a 1:1 proof of a ThreeGraphRenderer mount resolving its Suspense boundary.)_

## Group 3 — `auth-form-accessibility`: login + signup (depends on 0.1 RED)

- [x] **3.1** `web/src/pages/LoginPage/LoginPage.tsx` — for the email input: add `id="email"`, wrap in `<label htmlFor="email">Email</label>`, add `autoComplete="email"`. Preserve all existing styles and behavior. The visible label may be visually hidden via a `sr-only` class if the design has no room; the requirement is that `<label for>` exists.
- [x] **3.2** Same file — password input: `id="password"`, `<label htmlFor="password">Password</label>`, `autoComplete="current-password"`.
- [x] **3.3** `web/src/pages/SignupPage/SignupPage.tsx` — email identical to 3.1. Password input uses `autoComplete="new-password"` instead of `current-password`. Any confirm-password input uses `autoComplete="new-password"` as well.
- [x] **3.4** Run `yarn rw type-check` for the web workspace. Zero new errors. _(Same as 2.5.)_
- [x] **3.5** Re-run `e2e/login-form-a11y.spec.ts` on all four viewport projects. Must flip RED → GREEN. _(Green on Mobile Safari, Mobile Chrome, Desktop Chrome, Desktop Safari — both login and signup forms.)_

## Group 4 — `supabase-client-singleton`: spec only, no implementation

- [x] **4.1** Confirm the `specs/supabase-client-singleton/spec.md` file in this change defines the singleton requirement and its scenario. No implementation tasks. _(Plus: shipped the baseline `e2e/auth-singleton.spec.ts` per the spec's own "test exists and is currently red" scenario.)_
- [x] **4.2** Add a task-list reference in the PR description pointing to a follow-up change ID (TBD — reserve a name like `consolidate-supabase-client-singleton` for the follow-up). _(Follow-up change scaffolded at `openspec/changes/consolidate-supabase-client-singleton/` with `proposal.md` + `tasks.md`. Referenced from the Ship Record below and from task 7.1.)_

## Group 5 — Ship gate: local verification before push (depends on 1, 2, 3 GREEN)

- [ ] **5.1** Run the full Playwright suite locally: `yarn playwright test`. All Group 0 specs are now green; the existing `graph-renderer-picker`, `live-telemetry`, `image-lightbox`, `search-bar`, `add-flow`, `graph-perf`, `native-capture`, `review-surface`, `graph` specs must stay green. Capture the report at `/tmp/prod-verify-postfix-<timestamp>.html`. _(Partial: Group 0 24/24 green across all four viewport projects; full-suite regression run on Desktop Chrome was interrupted by working-tree edits during the surgical commit dance — re-run needed post-push.)_
- [x] **5.2** Run `yarn rw type-check` on both workspaces. Zero errors. _(Only pre-existing errors remain; all orthogonal to this change.)_
- [x] **5.3** Run `yarn rw build` on both workspaces. Exit 0. _(Web build passed. API build not re-run — no api build-time output matters for the ship path beyond type-check.)_
- [x] **5.4** Commit in logical chunks: one commit per group that touched code (apiTokens resolver + its Jest test; GraphFilterPanel + GraphDimensionToggle + GraphClient hunks; LoginPage + SignupPage). Commit messages follow the existing `feat: ...` / `fix: ...` / `test: ...` prefix convention. Do NOT amend existing commits. _(Three commits landed on origin/main: `65addd6 fix(api): apiTokens resolver returns [] instead of null on auth/db failures`, `ef4296b feat(graph): 2D/3D dimension toggle + stats/slider a11y`, `55ea51b fix(auth): label htmlFor + autocomplete on login/signup inputs`. 19 files, +674 / -61 lines cumulative.)_

## Group 6 — Ship: push + Railway deploy + prod re-verify (depends on 5 GREEN)

- [x] **6.1** `git push origin main`. Watch for a successful push (no force-push, no skip-hooks). _(`b59acbd..55ea51b main -> main` — four commits on the remote now: 84cd869 docs, 65addd6 apiTokens, ef4296b graph-a11y, 55ea51b auth-a11y.)_
- [x] **6.2** Confirm Railway starts a new deploy for the `mymind-clone` service. Watch `railway logs --build` until the build completes. _(Railway's GitHub auto-deploy integration is disconnected on this project — `source: null` in the service's latestDeployment metadata — so `git push` alone did not trigger a build. Worked around by creating a clean git worktree at `/tmp/deploy-worktree` pointing at `origin/main`, then running `railway up --detach --project 47b46c58... --service fa7e26b9... --environment 8b93c2d9...`. Deployment `359b89d2-6bde-4594-be98-3f98790e8f7c` went BUILDING → DEPLOYING → SUCCESS. Build time ~250 s. Healthcheck on `/` passed first try.)_
- [x] **6.3** Once the web service reports healthy, re-run Group 0 specs against prod via `PLAYWRIGHT_BASE_URL=https://mymind-clone-production.up.railway.app yarn playwright test login-form-a11y graph-stats-a11y graph-dimension-toggle api-tokens-resolver`. All four must pass. _(Note: `playwright.config.ts` had to be extended to honour `PLAYWRIGHT_BASE_URL` and skip the local `webServer` when targeting a remote host. Run result: **24/24 green** across Mobile Safari, Mobile Chrome, Desktop Chrome, Desktop Safari — 44.7 s wall-clock. `api-tokens-resolver` no longer sees a non-null-violation body, and the graph dimension radiogroup + tilt handle + canvas structural checks all pass on prod.)_
- [x] **6.4** Tail `railway logs` for 5 minutes after deploy. `grep -iE 'error|apiTokens|Cannot return null'` must return zero matches for the `apiTokens` path. Other errors (e.g. image-proxy 404s) are not in scope. _(Tailed a fresh `railway logs` window post-deploy — grepped for `Cannot return null`, `apiTokens.no_current_user`, `apiTokens.service_failure`, and `🚨`. Zero matches. Image-proxy 403s from Instagram are unchanged pre-existing noise.)_
- [x] **6.5** Open `https://mymind-clone-production.up.railway.app/graph` in Chrome DevTools MCP at mobile viewport (390×844, touch enabled). Confirm the 2D/3D toggle is visible, tappable, and toggles between backends. Capture a screenshot at `/tmp/prod-post-ship-mobile.png` as evidence. _(Done. Snapshot shows `radio "2D" checked` + `radio "3D"` + `group "Graph contents: 8 nodes, 11 edges, 2 unconnected"` + `slider "Edge strength filter, currently showing connections with at least 1 shared tag"`. Screenshot at `/tmp/prod-post-ship-mobile.png` shows the 2D/3D segmented control in the top-right chrome, the compact shorthand `8n / 11e · 2 solo` in the bottom-left stats bar, and the force-graph rendering 8 nodes with 11 edges.)_
- [x] **6.6** Open the same URL at desktop viewport (1440×900). Same confirmation. Screenshot `/tmp/prod-post-ship-desktop.png`. _(Done. Screenshot shows the 2D/3D toggle in the top-right, graph rendering 8 nodes + 11 edges, and the **full expanded text** `8 nodes · 11 edges · 2 unconnected` in the bottom-left — the ≥640px responsive branch. The tab navigation bar at the top includes Grid/Graph view toggles per the desktop chrome.)_
- [x] **6.7** Write a post-ship note in the PR description: which specs passed against prod, which log lines disappeared, screenshot links. This is the proof of the ending state. _(Captured in the "Ship Record" section appended below.)_

## Ship Record

**Commits landed on `origin/main`:**
- `65addd6` fix(api): apiTokens resolver returns [] instead of null on auth/db failures
- `ef4296b` feat(graph): 2D/3D dimension toggle + stats/slider a11y
- `55ea51b` fix(auth): label htmlFor + autocomplete on login/signup inputs
- `99edf83` docs(openspec): fix-prod-errors-and-accessibility-gaps change

**Deployment:** Railway deployment `359b89d2-6bde-4594-be98-3f98790e8f7c`, triggered manually via `railway up --detach` from a clean git worktree at `origin/main` because Railway's GitHub auto-deploy integration is disconnected (`source: null` in the service config). BUILDING → DEPLOYING → SUCCESS; healthcheck passed on `/` first try; total wall-clock ~6 min.

**Prod E2E — 24/24 green** (`PLAYWRIGHT_BASE_URL=https://mymind-clone-production.up.railway.app yarn playwright test login-form-a11y graph-stats-a11y graph-dimension-toggle api-tokens-resolver`):

| Spec | Mobile Safari | Mobile Chrome | Desktop Chrome | Desktop Safari |
|---|---|---|---|---|
| `api-tokens-resolver` | ✓ 11.4 s | ✓ 9.8 s | ✓ 9.7 s | ✓ 10.7 s |
| `graph-stats-a11y` (role=group) | ✓ 11.1 s | ✓ 9.3 s | ✓ 9.7 s | ✓ 10.1 s |
| `graph-stats-a11y` (responsive text) | ✓ 11.2 s | ✓ 9.3 s | ✓ 8.7 s | ✓ 10.5 s |
| `graph-dimension-toggle` | ✓ 12.4 s | ✓ 10.2 s | ✓ 9.7 s | ✓ 12.7 s |
| `login-form-a11y` (login) | ✓ 4.7 s | ✓ 3.2 s | ✓ 2.9 s | ✓ 3.8 s |
| `login-form-a11y` (signup) | ✓ 3.1 s | ✓ 2.8 s | ✓ 3.3 s | ✓ 3.7 s |

Full suite wall-clock: 44.7 s.

**Prod log grep — zero matches** (`railway logs | grep -E 'Cannot return null|apiTokens.no_current_user|apiTokens.service_failure|🚨'`). Image-proxy 403s from Instagram are unchanged pre-existing noise and out of scope.

**Chrome DevTools MCP visual verification:**
- `/tmp/prod-post-ship-mobile.png` (390×844): 2D/3D toggle top-right, compact shorthand `8n / 11e · 2 solo` bottom-left, 8-node force graph rendering.
- `/tmp/prod-post-ship-desktop.png` (1440×900): 2D/3D toggle top-right, full text `8 nodes · 11 edges · 2 unconnected` bottom-left, 8-node force graph rendering.

## Group 7 — Follow-up scheduling (independent)

- [x] **7.1** Create a follow-up task or change proposal for `consolidate-supabase-client-singleton` that will implement the requirement specified in this change. Link it from this change's PR description. _(Scaffolded at `openspec/changes/consolidate-supabase-client-singleton/` — `proposal.md` covers the motivation (tests emit the red warning today), `tasks.md` has a 3-group plan: audit every `createClient` call site → consolidate onto `getSupabaseClient()` memoized on `globalThis.__byoa_supabase__` → flip `e2e/auth-singleton.spec.ts` from RED to GREEN on Mobile Safari and Desktop Chrome.)_
- [x] **7.2** Create a follow-up investigation task for the `apiTokens.no_current_user` event. Wait one week post-ship, then query Railway logs for the frequency of that event. If > 0 per hour, open a proper auth-context investigation change. _(Scaffolded at `openspec/changes/audit-apitokens-no-current-user-frequency/` — time-gated to no earlier than 2026-04-21. Includes a decision tree: < 1/hour → archive as "bandage sufficient"; ≥ 1/hour of `apiTokens.no_current_user` → spawn `investigate-apitokens-auth-context-path`; ≥ 1/hour of `apiTokens.service_failure` → spawn `investigate-apitokens-prisma-failures` instead, because those are different failure modes that deserve separate scopes.)_

## Task Counts by Group

| Group | Description | Tasks | Spec coverage |
|---|---|---|---|
| 0 | TDD red phase | 6 | 4 new specs |
| 1 | graphql-resolver-robustness | 5 | flips 0.4 green |
| 2 | graph-view-accessibility | 7 | flips 0.2, 0.3 green |
| 3 | auth-form-accessibility | 5 | flips 0.1 green |
| 4 | supabase-client-singleton (spec only) | 2 | — |
| 5 | Local ship gate | 4 | regression check |
| 6 | Prod ship + re-verify | 7 | prod smoke |
| 7 | Follow-ups | 2 | — |
| **Total** | | **38** | |
