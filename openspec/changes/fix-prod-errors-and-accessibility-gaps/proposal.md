## Why

A hands-on prod verification pass against `https://mymind-clone-production.up.railway.app` (deployed commit `b59acbd`, 2026-04-13) surfaced four ship-blockers that keep "everything working" from being true tonight:

1. **`Query.apiTokens` is erroring on every Settings page load.** Railway logs show a repeated `GraphQLError: Cannot return null for non-nullable field Query.apiTokens.` The schema at `api/src/graphql/apiTokens.sdl.ts:26` declares `apiTokens: [ApiToken!]! @requireAuth`, the resolver calls `context.currentUser!.id` then `serviceList({userId})`. `listApiTokens` (service at `api/src/services/apiTokens/apiTokens.ts:107`) returns `db.apiToken.findMany(...)` which can never return null — so the resolver must be throwing, and GraphQL nulls the field, triggering the non-null violation. The `api_tokens` table exists on prod Supabase and has rows (confirmed via service-role probe). Users see `MobileCaptureSection` silently render "No active tokens yet." while the backend emits an error per page load.

2. **Mobile has no visible way to switch to 3D graph rendering.** Prod `GraphClient.tsx` only offers the renderer picker in `Settings → Experimental`, and picking `3D · Three.js` in that picker is silently downgraded to `canvas` by `GraphClient.tsx:301-303` unless `localDimension === '3d'`. There is no UI on prod to set `localDimension` to `'3d'` — the `GraphDimensionToggle` component and its mount point inside `GraphClient.tsx:1228-1234` exist only on disk (uncommitted). The `fix-3d-graph-and-complete-clusters` change marks tasks 5.1-5.4 complete but the work has never been shipped. A user reported "mobile isn't showing 3D" — not a mobile-specific bug, a "feature isn't in production" bug.

3. **The graph stats strip is cryptic to every user, sighted or not.** `GraphFilterPanel.tsx:30-41` renders `{nodeCount}n / {edgeCount}e · {orphanCount} solo` with no `aria-label`, no `title`, no visible-on-desktop expansion, and no screen-reader-only full-word version. Screenshot evidence: users see `8n / 11e · 2 solo   edges ≥ 1` and have no way to decode it. This surface is present on every `/graph` load.

4. **The login form fails two automated a11y checks on every load.** Chrome DevTools reports `No label associated with a form field` and `A form field element should have an id or name attribute` for both email and password inputs on `/login`, plus a verbose `autocomplete` warning. `LoginPage.tsx` uses bare `<input type="email">` without `id`, `htmlFor`, or `autoComplete` attributes. This is a tonight-fixable a11y/a11y-adjacent regression.

Secondary finding, tracked but **not fixed in this change** (see Out of Scope): a `Multiple GoTrueClient instances detected` console warning fires after login. Two Supabase clients get initialized under the same storage key. This is real but has no user-visible symptom and needs a broader investigation of the auth module boundaries. Deferred.

This change is the narrowest patch that (a) stops the apiTokens error bleeding to logs, (b) ships the already-built dimension toggle so mobile + desktop can reach the 3D renderer, (c) makes the graph stats readable by every user, and (d) makes the login form accessible. TDD specs in `e2e/` are written first, run red against the current state, and are expected to flip green as each group lands.

## What Changes

### New — Playwright specs that prove the failing state (Group 0)

- `e2e/login-form-a11y.spec.ts` — asserts every input on `/login` has `id`, a matching `<label for>`, and an `autoComplete` attribute. Runs on `Mobile Safari`, `Mobile Chrome`, `Desktop Chrome`, `Desktop Safari` projects per existing `playwright.config.ts`.
- `e2e/graph-stats-a11y.spec.ts` — asserts `GraphFilterPanel` renders a `[role=group][aria-label*="nodes"][aria-label*="edges"]` element, and on viewports ≥ 640 px also renders the expanded words "nodes", "edges", and (when present) "unconnected" as visible text.
- `e2e/graph-dimension-toggle.spec.ts` — asserts a `role=radiogroup[aria-label="Graph dimensionality"]` is visible on `/graph`, both `2D` and `3D` buttons have bounding boxes ≥ 44×44 px, the control is operable with keyboard (`Tab`, `Space`, `Enter`), and toggling to 3D mounts a `<canvas>` whose `getContext('webgl2')` is non-null. Runs on all four viewport projects.
- `e2e/api-tokens-resolver.spec.ts` — logs in, navigates to `/settings`, captures every GraphQL response body via `page.on('response')`, asserts no response contains a `Cannot return null` error and no response has an `errors[]` entry for field `apiTokens`.

These specs MUST fail against current code (commit `b59acbd`) and MUST pass after this change ships. Each Group below names which spec flips from red to green.

### New — `graph-view-accessibility` capability

- `GraphFilterPanel.tsx` wraps the stats shorthand in a `<div role="group" aria-label="Graph contents: N nodes, M edges, K unconnected">` computed from props. On viewports ≥ 640 px, a visible expansion reads `"N nodes · M edges · K unconnected"` (full words, not `n`/`e`/`solo`). On viewports < 640 px, the compact shorthand stays visible and the aria-label carries the full text for screen readers.
- The existing edge-strength slider's `aria-label` becomes a sentence form: `"Edge strength filter, currently showing connections with at least N shared tag(s)"`. The ternary for singular/plural stays.
- The `GraphDimensionToggle` component is committed from its current uncommitted state. `GraphClient.tsx` ships the mount point in the top-right chrome for both mobile and desktop. No viewport-gating.
- Flips `e2e/graph-stats-a11y.spec.ts` and `e2e/graph-dimension-toggle.spec.ts` green.

### New — `auth-form-accessibility` capability

- `LoginPage.tsx` — email input gains `id="email"`, wrapped in `<label htmlFor="email">Email</label>`, `autoComplete="email"`. Password input gains `id="password"`, `<label htmlFor="password">Password</label>`, `autoComplete="current-password"`.
- `SignupPage.tsx` — same treatment, except the password input uses `autoComplete="new-password"`.
- Flips `e2e/login-form-a11y.spec.ts` green.

### New — `graphql-resolver-robustness` capability

- `api/src/graphql/apiTokens.sdl.ts` resolver wraps the service call in a `try`/`catch`. On `currentUser` being null-or-undefined, it logs at `error` level and returns `[]` (preserving the non-null array contract). On service errors, it logs at `error` level with the full error and returns `[]` so the Settings page renders.
- A new `api/src/graphql/apiTokens.test.ts` unit test mocks `context.currentUser = null` and asserts the resolver returns `[]` rather than throwing.
- A new test case covers the "service throws" path — mocks `listApiTokens` to reject, asserts resolver returns `[]` and logs the error.
- Flips `e2e/api-tokens-resolver.spec.ts` green.

### New — `supabase-client-singleton` capability (defined, NOT implemented in this change)

- Adds a capability specification describing the singleton requirement. Implementation is explicitly deferred to a follow-up change so this change's blast radius stays small (see Out of Scope). The spec exists here so future work has a requirement to code against.

### Modified — TDD scaffolding

- `e2e/support/fixtures.ts` — no changes required. The existing `testUser` + Supabase service-role helpers cover all four Group 0 specs.
- Specs run under the default `webServer: yarn rw dev` which binds `http://localhost:8913`. An override via `PLAYWRIGHT_BASE_URL` lets the same specs run against the live Railway URL for post-deploy smoke verification.

## Capabilities

### New Capabilities

- **`graph-view-accessibility`** — governs user-facing a11y invariants on the `/graph` page: readable stats, visible 2D/3D toggle on every viewport, keyboard operability, and touch targets. Lives adjacent to but distinct from `graph-view-overhaul` (owned by `fix-3d-graph-and-complete-clusters`), which governs the architecture of the renderer pipeline. This capability owns the presentation-layer accessibility; the other owns the renderer mechanics.
- **`auth-form-accessibility`** — governs the sign-in / sign-up form a11y contract: input labeling, autofill, focus order, and error announcements. Extends to any future auth form (MFA, password reset) without re-speccing the same requirements.
- **`graphql-resolver-robustness`** — governs how API resolvers handle null or unauthenticated context, service errors, and the invariant that `[Foo!]!` array fields never propagate a null to the client. This is the first requirement; future additions to this capability can cover rate-limit errors, Prisma cold-start timeouts, and similar cross-cutting resolver concerns.
- **`supabase-client-singleton`** — governs the invariant that exactly one Supabase anon client exists per browser context, keyed to the same storage key. Adds the requirement; implementation deferred.

### Not touched

- **`graph-view-overhaul`** (owned by `fix-3d-graph-and-complete-clusters`) — the renderer mechanics, camera math, pointer wiring, and cluster save flow are all owned by that change. This change ships the user-visible dimension toggle but does not re-specify the renderer behavior.
- **`graph-clusters`** (same owner) — out of scope.
- **`source-*`** capabilities — unrelated.
- **`local-first-ai-runtime`** / **`embedding-provider-compatibility`** — unrelated.

## Impact

- **Schema** — no schema changes. No migrations.
- **API** — one resolver patched (`apiTokens.sdl.ts`), one new Jest test file (`api/src/graphql/apiTokens.test.ts`). Does not touch the service layer.
- **Web** — `GraphFilterPanel.tsx` (~25 LOC), `LoginPage.tsx` (~20 LOC), `SignupPage.tsx` (~20 LOC), `GraphClient.tsx` (commit the existing top-right chrome change, no new code), new committed `GraphDimensionToggle.tsx` (already on disk, ~74 LOC moves from untracked → tracked).
- **Tests** — four new Playwright specs (~200 LOC total), one new Jest unit test (~60 LOC).
- **Ops** — zero migrations, zero env changes, zero Railway config changes. Pushes to `origin/main` trigger an automatic Railway redeploy from the existing `Dockerfile`.
- **No breaking changes.** All changes are additive or surgical. Existing clients see no contract change. Users with saved `graphDimension === '2d'` (the default) see the same 2D canvas they see today.

## Out of Scope

- **`Multiple GoTrueClient instances detected` warning.** The `supabase-client-singleton` capability is specified here but implementation is deferred to a separate change. Reason: root-cause requires a grep-and-consolidation pass across every Supabase import in the web surface, including auth lib glue, and a decision about whether to introduce a React context. This is a proper investigation, not a tonight-surgical fix.
- **Root-cause investigation of the `apiTokens` null error.** This change applies a surgical try/catch that stops the error bleeding. Understanding *why* `currentUser` is null on authenticated requests (a deeper `@requireAuth` + Supabase context glue question) is owned by a follow-up investigation change. The surgical fix is acceptable because the symptom is user-visible and the full root-cause will take hours not minutes.
- **Ship of the larger uncommitted work** — review surface (`ReviewPage`, `ReviewCard`, enrichment review items migration), cluster/annotation services, DB migrations. Those have big blast radius and are owned by `fix-3d-graph-and-complete-clusters` and `rewrite-titles-and-verify-descriptions` respectively.
- **Signup form a11y beyond labels/autocomplete.** The current SignupPage has additional fields that may need their own a11y treatment (password confirmation, terms checkbox). Only the fields covered by the failing Playwright spec are in scope.
- **Prod URL as default Playwright `baseURL`.** The specs run against `yarn rw dev` by default and optionally against the Railway URL via `PLAYWRIGHT_BASE_URL` override. Changing the default is out of scope.
- **GraphQL resolver robustness for other resolvers.** Only `apiTokens` is fixed in this change. The capability spec covers the pattern so future resolvers can be audited, but cardsBucket / graphClusters / graphAnnotations / userPreferences audits are not in this change.

## Open Questions

These are ambiguities worth acknowledging; none of them block the spec from being validated or applied.

1. **Does the `apiTokens` resolver's `context.currentUser` being null on some requests indicate a broader `@requireAuth` bug that could affect other resolvers?** Likely yes. The surgical fix here is a bandage; the follow-up change is an audit. Logged as a follow-up but not scoped here.
2. **Should the expanded graph-stats copy say "nodes / edges / unconnected" or "cards / links / isolated"?** The former is technically accurate (matches the graph domain). The latter is friendlier (matches the product domain). Picking "nodes / edges / unconnected" for this change because it maps 1:1 to the existing shorthand and ships without a content review loop. Can be re-spelled without re-speccing.
3. **Mobile 44×44 px check against the `GraphDimensionToggle` — is the existing 44 px tall enough?** The component already declares `minWidth: 44, minHeight: 44` at `GraphDimensionToggle.tsx:55-56`. The Playwright spec should measure the rendered bounding box after CSS applies, not just the inline style. The spec handles this by calling `locator.boundingBox()` on each button.
4. **The `api-tokens-resolver.spec.ts` test relies on Playwright capturing GraphQL response bodies.** Playwright's `page.on('response')` requires an `await response.json()` to read the body, which can hang on very large responses. The spec caps at `/settings`-only traffic and filters by `url.includes('graphql')` to stay bounded. If this turns out to be flaky in Group 0 verification, we'll switch to `page.on('requestfinished')` and read from the HAR.
