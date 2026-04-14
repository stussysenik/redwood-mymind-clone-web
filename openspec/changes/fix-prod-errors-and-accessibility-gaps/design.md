# Design: fix-prod-errors-and-accessibility-gaps

Design notes for the trade-off decisions that span more than one file. Only decisions worth arguing about are captured here — straightforward changes live in the proposal.

## D1 — apiTokens resolver: surgical try/catch vs root-cause investigation

### The symptom

Railway logs show `GraphQLError: Cannot return null for non-nullable field Query.apiTokens.` firing every time the Settings page loads for an authenticated user. The resolver is:

```ts
export const apiTokens: QueryResolvers['apiTokens'] = async () => {
  const userId = context.currentUser!.id
  return serviceList({ userId })
}
```

`listApiTokens` returns `db.apiToken.findMany(...)`, which is incapable of returning `null` — worst case it returns `[]`. So the only way GraphQL sees `null` is if the resolver throws. The two candidate throw paths:

1. `context.currentUser` is null-or-undefined → `.id` access throws `TypeError: Cannot read properties of undefined (reading 'id')`. GraphQL catches this, sets the field to null, and then fails the `[ApiToken!]!` non-null contract.
2. `db.apiToken.findMany` throws — Prisma cold start, connection pool exhaustion, transient network.

The `api_tokens` table exists and has rows (confirmed via a service-role probe), so path (2) is less likely. Path (1) is the leading theory.

### The decision

Apply a **surgical try/catch** in the resolver. On any error, log at `error` level with enough context to root-cause later, and return `[]`.

```ts
export const apiTokens: QueryResolvers['apiTokens'] = async () => {
  const currentUser = context.currentUser
  if (!currentUser) {
    logger.error({ event: 'apiTokens.no_current_user' }, 'apiTokens resolver hit with no current user')
    return []
  }
  try {
    return await serviceList({ userId: currentUser.id })
  } catch (err) {
    logger.error({ err, event: 'apiTokens.service_failure' }, 'apiTokens service threw')
    return []
  }
}
```

### Alternatives considered

- **Option B — Relax the SDL to `[ApiToken!]`** (nullable array). Cheapest change. Rejected because it pushes the null-handling burden to every caller. `MobileCaptureSection` already iterates the result assuming it's an array; making it `Maybe<Array>` in the generated types means widening it everywhere it's consumed.
- **Option C — Root-cause the `@requireAuth` + Supabase context glue now.** Best long-term. Rejected because it spans `api/src/lib/auth.ts`, `api/src/functions/graphql.ts`, and the Supabase session-restore path. That's hours of investigation, not tonight's fix. It's tracked in Open Questions in the proposal and will be a follow-up change.
- **Option D — Fail loudly.** Let the error surface to the client so the user knows something is wrong. Rejected because it breaks the Settings page for every user without giving them an actionable next step. The current symptom is silent-backend-error-plus-empty-list, which is actually a reasonable user experience except for the log noise and the loss of observability into real token-listing failures.

### Why the surgical fix is acceptable

The bandage preserves the observable user experience (Settings renders, no angry error modal) and adds the missing logging so the follow-up investigation has structured context to grep for. It does not mask new errors — it surfaces them to the server logs at `error` level with an event name, which is searchable in Railway's log filter. The follow-up change can look at `event: apiTokens.no_current_user` frequency to size the real problem.

## D2 — Graph stats a11y: aria-only vs responsive visible expansion

### The symptom

`GraphFilterPanel.tsx:30-41` renders:

```tsx
<span className="text-[11px] font-mono select-none" style={{ color: 'var(--foreground-muted)' }}>
  {nodeCount}n&thinsp;/&thinsp;{edgeCount}e
  {orphanCount > 0 && (
    <>
      &ensp;&middot;&ensp;
      <span style={{ opacity: 0.6 }}>{orphanCount} solo</span>
    </>
  )}
</span>
```

A user reported this is unreadable. Evidence screenshot shows `8n / 11e · 2 solo   edges ≥ 1` — technical shorthand with no explanation.

### The decision

**Responsive visible expansion.** On viewports ≥ 640 px (the existing Tailwind `sm` breakpoint that the rest of the graph UI uses), show the full words. On mobile, keep the compact shorthand but ALWAYS expose the full text via `aria-label` on a wrapping `role="group"` element, so screen readers get the full sentence regardless of viewport.

Mobile output (compact + full aria-label):
```tsx
<div role="group" aria-label="Graph contents: 8 nodes, 11 edges, 2 unconnected">
  <span aria-hidden="true" className="text-[11px] font-mono select-none">
    8n / 11e · 2 solo
  </span>
</div>
```

Desktop output (expanded visible + same aria-label):
```tsx
<div role="group" aria-label="Graph contents: 8 nodes, 11 edges, 2 unconnected">
  <span className="hidden sm:inline text-[11px] font-mono select-none">
    8 nodes · 11 edges · 2 unconnected
  </span>
  <span aria-hidden="true" className="inline sm:hidden text-[11px] font-mono select-none">
    8n / 11e · 2 solo
  </span>
</div>
```

### Alternatives considered

- **Option A — `aria-label` only, leave the shorthand everywhere.** Sighted mobile users still can't decode it. Rejected — doesn't solve the complaint.
- **Option C — Always show the full words everywhere.** Takes up more horizontal space on mobile, crowding the edge-strength slider. Rejected — mobile real estate is scarce, the compact shorthand is fine IF sighted users on mobile have a `title` attribute as a hover hint (on desktop) or a tap-to-reveal on mobile. But that's additional interaction — simpler to keep both forms visible via responsive CSS, which this design already does.
- **Option D — Replace the shorthand entirely with icons + tooltips.** Interesting but out of scope. Icons need design review and content rules; the user's complaint is "I don't know what these letters mean," not "this needs to look different."

### Content choice

The expanded text uses **"nodes / edges / unconnected"** (graph-theory vocabulary). The proposal's Open Questions flags the alternative ("cards / links / isolated"). Picking graph-theory terms in this change because:

1. They're semantically precise — `orphanCount` is the count of nodes without any edges, which is literally "unconnected" in graph theory.
2. They're industry-standard in graph-viz tools (Gephi, Neo4j Bloom, Cytoscape).
3. The app's domain (BYOA / visual corpus) doesn't have a stable noun for "a thing in the graph" — cards, items, nodes, pieces are all used interchangeably across the codebase. "Nodes" matches the actual GraphQL field names (`GraphNode`, `GraphCell`), which is the lowest-friction choice.

Content can be swapped in a one-line change if a reviewer prefers the product-domain vocabulary.

## D3 — Supabase client singleton: defined now, implemented later

### The symptom

Console warn fires after `login(page, testUser)`:

```
GoTrueClient@sb-quxaamiuzdzpzrccohbu-auth-token:1 (2.99.3) Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.
```

Two Supabase anon clients are being instantiated in the same browser context, both keyed to the same storage key. The library calls this "undefined behavior." It has not produced a visible bug today, but under concurrent auth refreshes it could race.

### The decision

**Define the invariant in a spec delta now. Defer implementation to a follow-up change.**

The capability is named `supabase-client-singleton`. It contains one requirement: exactly one Supabase anon client exists per browser context, created via a `getSupabaseClient()` getter that memoizes on `globalThis.__byoa_supabase__`. The spec has one scenario: after a full page navigation + auth state restore, the browser console contains zero warnings matching `/Multiple GoTrueClient instances/`.

The implementation is deferred because the fix requires:

1. Grepping every `createClient(` or `new SupabaseClient(` call site in `web/src/`.
2. Identifying which call site is the "canonical" one (likely `web/src/lib/auth.ts` or `web/src/auth.ts`).
3. Consolidating the duplicates into a shared getter.
4. Updating imports across the web surface.
5. Re-verifying the warning is gone on the `Mobile Safari` / `Desktop Chrome` Playwright projects.

Step 1 alone is the diagnostic — the number of call sites is the scope indicator. Without running that grep, the follow-up change's size is unknown. Not a tonight-fix.

### Why specify it without implementing it

Because specs are the forcing function. Writing the requirement now means the next engineer (or next-session Claude) has a clean "here's the invariant, here's the scenario that proves it, go implement" starting point — rather than rediscovering the warning from scratch. OpenSpec lets requirements exist without matching implementation; the follow-up change will add the implementation tasks.

## D4 — Why four capabilities instead of one

Initial instinct was "one capability called `prod-readiness` covers everything." Rejected:

1. **Future discoverability.** A developer greps `openspec/specs/` for "graph" and wants to see all graph-related requirements. If graph stats a11y lives inside `prod-readiness`, it's hidden. If it lives in `graph-view-accessibility`, grep finds it. Names are indexes.
2. **Ownership.** Each capability has a clean scope: graph UI, auth forms, GraphQL resolvers, Supabase client init. These are four different owners (different files, different mental models, different testing strategies). Bundling them into one capability couples them for no reason.
3. **Future growth.** Each capability can accrue more requirements over time. `graph-view-accessibility` will eventually cover keyboard navigation, focus order, screen-reader announcements for dynamic updates, reduced-motion preferences. Each of those is an additional requirement under the same capability, not a whole new change proposal.
4. **The repo already does this.** `graph-view-overhaul` and `graph-clusters` are separate capabilities in `fix-3d-graph-and-complete-clusters`. The pattern is "one change can touch multiple capabilities," which is exactly what this change does.

The cost is four folders instead of one. The benefit is four future-findable homes for future requirements. Easy trade.

## D5 — Why write failing Playwright specs before any fix

The user asked explicitly for "tdd tested - i would rather tests fail - if they're accurately reflecting network endpoints + user state + functionality/interaction state." That's a mandate for real red-phase tests, not smoke tests that pass regardless.

The Group 0 specs are written against the **desired** state, not the current state. Each spec will fail on `main` today. Each spec passes after its group lands. This is TDD red-green applied to E2E: the spec is the contract, the fix is the implementation, and the spec file itself is the regression guard forever.

The alternative — writing tests alongside the fix — is cheaper but creates a known failure mode: the test accidentally matches the implementation rather than the requirement, so it passes on day one but lets a regression through on day one hundred. The user has been burned by this pattern before (see `feedback_no_mock_database` style corrections) and explicitly flagged it tonight.

Writing specs first also shifts the "which files are broken" question into runtime evidence. If `e2e/api-tokens-resolver.spec.ts` fails with a different error message than expected, that's a diagnostic signal that the diagnosis is wrong. Cheap insurance.

## D6 — Scope of this change vs ongoing fix-3d-graph-and-complete-clusters

`fix-3d-graph-and-complete-clusters` is at 42/66 tasks. Most of the remaining 24 are inside its scope: Three pointer wiring unit tests, long-press cluster save mobile spec, WebGL neighbor dimming verification. Those are all owned by that change.

This change **only** covers the prod-observable ship blockers tonight's verification found. It explicitly does not pull in:

- The 3D camera fix (owned by that change, already done, already on disk)
- The pointer wiring (owned by that change, already done)
- The cluster save flow (owned by that change, already done)
- The migration ops (owned by that change, already done)

This change DOES commit the `GraphDimensionToggle` file + its `GraphClient.tsx` mount point, because those are required to make `graph-view-accessibility`'s dimension-toggle-visible requirement real. But the commit is scoped to those files only. Other uncommitted work in `web/src/components/` (ClusterListSheet, ReviewCard, GraphListView redesign, etc.) stays uncommitted and is owned by its respective change.

The ordering is: **this change ships first**, stops the bleeding, adds the accessibility floor, and unblocks the next session's focus. Then `fix-3d-graph-and-complete-clusters` continues its remaining tasks against a green baseline.
