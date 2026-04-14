## Capability: supabase-client-singleton

Owns the invariant that exactly one Supabase anon client exists per browser context, keyed to the same storage key. Two Supabase clients in the same browser context racing the auth token refresh is "undefined behavior" per the GoTrue library's own warning, and has been observed in this repo via the browser console after login. This capability defines the requirement. Implementation is owned by a separate follow-up change.

## ADDED Requirements

### Requirement: Exactly one Supabase anon client per browser context

The web surface MUST initialize exactly one Supabase anon client in the browser context during a normal user session. A shared accessor MUST expose the client; all call sites MUST go through the accessor. Direct invocations of `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` in components, hooks, or library code outside the accessor are forbidden.

The accessor MAY memoize the instance on `globalThis` (for example, `globalThis.__byoa_supabase_anon__`) to survive hot-module-reload in development without creating a second instance. If a React context approach is preferred, the provider MUST live at the application root and every consumer MUST go through a hook that reads from that context.

This requirement applies only to the **anon** client (the one running in the browser). The service-role client used in E2E fixtures, API-side code paths, and serverless functions is a separate instance and is out of scope.

#### Scenario: Console is silent after login

Given a user navigates to `/login`, signs in, and lands on `/`,
When the browser console is inspected,
Then it contains zero messages matching `/Multiple GoTrueClient instances detected/`.

#### Scenario: Console is silent across navigation

Given an authenticated user,
When they navigate from `/` to `/graph` to `/settings` to `/login` and back to `/`,
Then the browser console contains zero messages matching `/Multiple GoTrueClient instances detected/` across every navigation.

#### Scenario: Only one createClient call site in web/src

Given the repository at HEAD after the implementation change lands,
When `grep -rn 'createClient(' web/src/` runs,
Then the result contains exactly one call site for the anon client (inside the shared accessor module), and every other file reads the client via the accessor.

### Requirement: The warning is enforced by an E2E test

A Playwright spec MUST assert zero `Multiple GoTrueClient instances` warnings are emitted to the console during a full login + navigation flow. The spec MUST be written in this change, RUN RED against current code, and flip GREEN only after the follow-up implementation change lands. In this change's timeline, the spec is the forcing function that proves the follow-up is actually needed.

Note: this requirement's spec implementation is the **only** part of the supabase-client-singleton capability that is expected to ship in the `fix-prod-errors-and-accessibility-gaps` change — the code fix is deferred. The spec's purpose in this change is to codify the invariant and provide a failing-baseline measurement for the follow-up.

#### Scenario: Test exists and is currently red

Given `e2e/auth-singleton.spec.ts` runs against current (pre-fix) code,
When the test navigates through the login flow,
Then the test FAILS because the console emits at least one `Multiple GoTrueClient instances detected` warning.

#### Scenario: Test flips green once singleton lands

Given the follow-up `consolidate-supabase-client-singleton` change ships,
When `e2e/auth-singleton.spec.ts` runs against post-fix code,
Then the test PASSES because the console emits zero such warnings.
