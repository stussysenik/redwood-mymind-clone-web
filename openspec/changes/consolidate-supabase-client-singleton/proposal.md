## Why

`fix-prod-errors-and-accessibility-gaps` defined the `supabase-client-singleton` capability and its red-phase scenario but explicitly deferred the implementation (see that change's design §D3). The symptom today: every test navigation emits `GoTrueClient@sb-quxaamiuzdzpzrccohbu-auth-token:1 (2.99.3) Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`

Two Supabase anon clients are being instantiated in the same browser context, both keyed to the same storage key. The library calls this "undefined behavior." It has not produced a visible user bug yet, but under concurrent auth refreshes it could race. The red-phase spec (`e2e/auth-singleton.spec.ts`) is already committed and failing — this change is the implementation that flips it green.

## What Changes

- Consolidate every `createClient(` / `new SupabaseClient(` call site in `web/src/` onto a single canonical getter — `getSupabaseClient()` memoizing on `globalThis.__byoa_supabase__` — so the browser has exactly one client per context.
- Update every import site to pull from the shared getter instead of its own factory.
- Re-verify `e2e/auth-singleton.spec.ts` flips RED → GREEN on Mobile Safari and Desktop Chrome.
- No schema / API / migration work — this is a frontend-only refactor with a structural invariant guarded by an existing E2E spec.

**Affected capability:** `supabase-client-singleton` — implementation of the requirement that already has a spec in the `fix-prod-errors-and-accessibility-gaps` change.

## Impact

- **Users:** No observable behavior change if the singleton is wired correctly. The win is the removal of a library-flagged "undefined behavior" path.
- **Developers:** All new Supabase usage must go through `getSupabaseClient()`. The getter itself is ~15 lines.
- **Tests:** `e2e/auth-singleton.spec.ts` flips green. No other spec should change.

## Scope — Pre-work Checklist (before the implementing session starts)

1. `rg -n "createClient|new SupabaseClient" web/src/` — enumerate every call site. The count is the true scope indicator; without it, this change's size is unknown.
2. Identify the "canonical" call site (likely `web/src/lib/auth.ts` or `web/src/auth.ts`) and decide whether to move the getter there or to a new `web/src/lib/supabase.ts`.
3. Audit whether any server-side (SSR) code also creates clients — if so, the singleton must be context-aware (client vs server).
