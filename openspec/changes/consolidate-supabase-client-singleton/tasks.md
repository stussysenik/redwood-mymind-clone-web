# Tasks: consolidate-supabase-client-singleton

Ordered by dependency. The red-phase spec (`e2e/auth-singleton.spec.ts`) already exists from `fix-prod-errors-and-accessibility-gaps` — this change is the implementation that flips it green.

## Group 0 — Pre-work audit (no deps)

- [x] **0.1** Enumerated call sites: two distinct anon client factories (eager `supabaseClient.ts`, lazy `supabase-browser.ts`) + 5 import sites (`auth.ts`, `local-ai/context.tsx`, `realtimeCards.ts`, `SerendipityClient.tsx`, `UserMenu.tsx`). No service-role client found on web side.
- [x] **0.2** Picked `web/src/lib/supabaseClient.ts` as canonical owner — already rooted by `auth.ts`, lowest cascade.
- [x] **0.3** Confirmed RED by static inspection: two distinct instantiation paths existed in code.

## Group 1 — Implementation (depends on 0)

- [x] **1.1** Rewrote `supabaseClient.ts` with `getSupabaseClient()` memoized on `globalThis.__byoa_supabase__`, signature `getSupabaseClient(): SupabaseClient`, throws on missing env. `export const supabase = getSupabaseClient()` for backward compat.
- [x] **1.2** Repointed `realtimeCards.ts`, `SerendipityClient.tsx`, `UserMenu.tsx` to import from `supabaseClient.ts`; deleted shim files `supabase-browser.ts` and `supabase.ts`. `auth.ts` and `local-ai/context.tsx` were already importing the canonical file — no change needed. Exactly one `createClient(url, key)` call remains, inside the canonical module.
- [x] **1.3** `yarn rw type-check` — zero new errors in touched files. All remaining type errors are pre-existing in `api/` and `.storybook/`, unrelated to this change.
- [x] **1.4** `yarn rw build web` — exit 0.

## Group 2 — Verification (depends on 1)

- [x] **2.1** `e2e/auth-singleton.spec.ts` flipped RED → GREEN on Mobile Safari and Desktop Chrome. Zero console warnings matching `/Multiple GoTrueClient instances/`.
- [x] **2.2** Full Playwright suite passed for all auth-relevant specs (`auth-singleton`, `login-form-a11y`, `api-tokens-resolver`). Unrelated failures (`native-capture`, `graph-perf`, `review-surface`) pre-exist on `main` or are from uncommitted WIP.
- [x] **2.3** Manual Chrome DevTools MCP smoke: loaded `/`, `/graph`, `/settings` with Console open. Zero `GoTrueClient` warnings; session restore worked through the singleton.

## Group 3 — Ship

- [ ] **3.1** Single commit, `refactor(auth): consolidate Supabase client on getSupabaseClient() singleton`.
- [ ] **3.2** Push + `railway up` (auto-deploy is disconnected on this project — see `fix-prod-errors-and-accessibility-gaps` Ship Record).
- [ ] **3.3** Re-run `auth-singleton.spec.ts` against prod. Must be GREEN.
