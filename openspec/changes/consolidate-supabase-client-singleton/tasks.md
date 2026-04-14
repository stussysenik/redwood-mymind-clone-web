# Tasks: consolidate-supabase-client-singleton

Ordered by dependency. The red-phase spec (`e2e/auth-singleton.spec.ts`) already exists from `fix-prod-errors-and-accessibility-gaps` — this change is the implementation that flips it green.

## Group 0 — Pre-work audit (no deps)

- [ ] **0.1** Run `rg -n "createClient|new SupabaseClient" web/src/` and capture every call site. Note which ones construct anon clients vs service-role clients (service-role should not be on the web side at all; if found, that's a separate security finding).
- [ ] **0.2** Identify the current "canonical" call site and the file that should own `getSupabaseClient()`. Candidates: `web/src/lib/auth.ts`, `web/src/auth.ts`, new `web/src/lib/supabase.ts`. Pick based on which file's imports cascade least.
- [ ] **0.3** Confirm the red-phase spec `e2e/auth-singleton.spec.ts` is currently RED against local dev. If it's green, the problem already went away and this change is obsolete.

## Group 1 — Implementation (depends on 0)

- [ ] **1.1** Create or extend the canonical file with `getSupabaseClient()` — memoize on `globalThis.__byoa_supabase__` so hot-reload doesn't double-instantiate. Signature: `getSupabaseClient(): SupabaseClient`.
- [ ] **1.2** Update every call site identified in 0.1 to import the getter instead of calling `createClient` directly. Delete the stale factory calls.
- [ ] **1.3** `yarn rw type-check` — zero new errors in touched files.
- [ ] **1.4** `yarn rw build web` — exit 0.

## Group 2 — Verification (depends on 1)

- [ ] **2.1** Re-run `e2e/auth-singleton.spec.ts` on Mobile Safari and Desktop Chrome. Must flip RED → GREEN — the browser console must emit zero warnings matching `/Multiple GoTrueClient instances/`.
- [ ] **2.2** Run the full Playwright suite to catch any auth-path regressions. Login, signup, logout, session restore, protected routes — all stay green.
- [ ] **2.3** Manual smoke: load `/`, `/graph`, `/settings` in Chrome DevTools MCP with Console open. Zero `GoTrueClient` warnings.

## Group 3 — Ship

- [ ] **3.1** Single commit, `refactor(auth): consolidate Supabase client on getSupabaseClient() singleton`.
- [ ] **3.2** Push + `railway up` (auto-deploy is disconnected on this project — see `fix-prod-errors-and-accessibility-gaps` Ship Record).
- [ ] **3.3** Re-run `auth-singleton.spec.ts` against prod. Must be GREEN.
