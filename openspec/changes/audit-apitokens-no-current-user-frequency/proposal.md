## Why

`fix-prod-errors-and-accessibility-gaps` landed a surgical fix for the `Query.apiTokens` null-field error: when `context.currentUser` is missing, the resolver logs `apiTokens.no_current_user` at `error` level and returns `[]`. That stops the user-visible bleeding, but it masks the underlying question: **how often is `context.currentUser` actually missing on this code path?**

Two possibilities:
1. **Rarely-ever** — a handful of events per day from stale sessions, bot probes, or Apollo pre-auth rehydration races. The bandage is a permanent correct behavior and we close the book.
2. **All the time** — dozens or hundreds of events per hour, meaning Redwood's auth context is genuinely broken for a real user population. In that case the bandage only hides the real bug (likely `api/src/functions/graphql.ts` + `api/src/lib/auth.ts` + the Supabase session-restore path) and we need a proper root-cause investigation.

We can't tell which one is true without measuring. This change schedules that measurement.

## What Changes

- Query Railway production logs **one week after the ship** (target date: 2026-04-21) for occurrences of the structured log event `apiTokens.no_current_user`. Also grep for `apiTokens.service_failure` to catch Prisma-path failures.
- Compute events-per-hour across the full week window.
- **Decision gate:** if the frequency is **> 0 events per hour sustained**, open a real investigation change (`investigate-apitokens-auth-context-path`) that root-causes the auth context propagation. If it's below that threshold, archive this change as "bandage was sufficient — no further work needed."

## Scope

- No code changes. This is an operational audit + decision gate.
- Artifacts: a log query result captured in this change's `tasks.md`, plus either (a) a new investigation change scaffold or (b) a note in this change's closing summary.

## Not In Scope

- The actual root-cause investigation. That is the work of the *conditional* follow-up change this audit may spawn.
- Any tests or alerting rules — those belong to the investigation change if it's spun up.
