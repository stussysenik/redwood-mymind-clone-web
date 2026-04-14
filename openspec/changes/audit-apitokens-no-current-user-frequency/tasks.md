# Tasks: audit-apitokens-no-current-user-frequency

Time-deferred audit. Do not start before **2026-04-21** (one week post-ship of `fix-prod-errors-and-accessibility-gaps`).

## Group 0 — Query

- [ ] **0.1** `railway logs` — filter for log entries whose message contains `apiTokens.no_current_user`. Capture the raw count over the full seven-day window since the ship commit (`65addd6`, 2026-04-14).
- [ ] **0.2** Same query for `apiTokens.service_failure`. This catches the "Prisma actually threw" branch, which is a *different* failure mode than "no current user" and warrants its own investigation if it fires.
- [ ] **0.3** Compute events-per-hour for each event type.

## Group 1 — Decision gate

- [ ] **1.1** If `apiTokens.no_current_user` rate ≥ 1 / hour sustained, scaffold `investigate-apitokens-auth-context-path` — a real investigation change covering `api/src/functions/graphql.ts`, `api/src/lib/auth.ts`, and the Supabase session-restore path on the client. Link it from this change's closing summary.
- [ ] **1.2** If `apiTokens.service_failure` rate ≥ 1 / hour sustained, scaffold `investigate-apitokens-prisma-failures` — a separate investigation because the failure path is different (Prisma-side rather than auth-side).
- [ ] **1.3** If both rates are < 1 / hour, archive this change with a one-line summary: "bandage sufficient, no further action." The `fix-prod-errors-and-accessibility-gaps` surgical fix becomes the permanent behavior.

## Group 2 — Close

- [ ] **2.1** Update this `tasks.md` with the raw query results (counts, time window, decisions).
- [ ] **2.2** Move this change to archive (`openspec archive audit-apitokens-no-current-user-frequency`) once the decision is recorded.
