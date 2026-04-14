## Capability: graphql-resolver-robustness

Owns the invariant that GraphQL resolvers in `api/src/graphql/` never propagate a thrown error as a null value for a non-nullable field. Resolvers that return non-null arrays MUST return an empty array (not null) when the happy path is unreachable, and MUST log the failure with structured context so follow-up investigation has observability. This capability starts with `apiTokens` and grows to cover other resolvers as failures are found.

## ADDED Requirements

### Requirement: apiTokens resolver never returns null

The `apiTokens` resolver in `api/src/graphql/apiTokens.sdl.ts` MUST never return null or throw uncaught. The resolver MUST:

- Null-check `context.currentUser` before accessing `.id`. If `currentUser` is null or undefined, return `[]` and log an `error`-level event named `apiTokens.no_current_user` with enough context (request id if available, timestamp) to root-cause later.
- Wrap the call to `listApiTokens` in a `try`/`catch`. On any thrown error, return `[]` and log an `error`-level event named `apiTokens.service_failure` with the `err` object attached so the log line is greppable.
- Preserve the existing SDL contract `apiTokens: [ApiToken!]! @requireAuth`. Changing the SDL to a nullable return type is explicitly forbidden by this requirement because it would shift null-handling into every client consumer.

#### Scenario: No current user returns empty array

Given a GraphQL request whose `context.currentUser` is null or undefined,
When the `apiTokens` resolver executes,
Then it returns `[]` without throwing, and a log line matching `event: apiTokens.no_current_user` is emitted at `error` level.

#### Scenario: Service throws returns empty array

Given a GraphQL request whose `context.currentUser` is a valid user,
And `listApiTokens` rejects with an error,
When the `apiTokens` resolver executes,
Then it returns `[]` without throwing, and a log line matching `event: apiTokens.service_failure` is emitted with the full error attached.

#### Scenario: Happy path returns tokens unchanged

Given a GraphQL request whose `context.currentUser` is a valid user,
And `listApiTokens` resolves with `[tokenA, tokenB]`,
When the `apiTokens` resolver executes,
Then it returns `[tokenA, tokenB]` unchanged, and no error log lines are emitted.

#### Scenario: Prod logs are silent about apiTokens nulls

Given this change has shipped to prod and Settings page load traffic is flowing,
When `railway logs --lines 500 | grep "Cannot return null.*apiTokens"` runs,
Then it returns zero matches.

### Requirement: Resolver robustness is covered by a unit test

`api/src/graphql/apiTokens.test.ts` MUST exist and MUST cover three cases: `currentUser` null → returns `[]`; service throws → returns `[]`; happy path → returns the service result unchanged. The test MUST use Jest's `jest.mock` for the service module so the test is hermetic and fast.

The `[ApiToken!]!` SDL contract itself is not tested in unit tests (that is GraphQL framework code); the invariant is tested indirectly — by proving the resolver always returns an array — and directly by `e2e/api-tokens-resolver.spec.ts` which watches real GraphQL responses for error envelopes.

#### Scenario: Unit test covers null currentUser

Given `api/src/graphql/apiTokens.test.ts` runs,
When the test named "returns [] when currentUser is null" executes,
Then it sets `context.currentUser = null`, invokes the resolver, and asserts the result is deeply equal to `[]`.

#### Scenario: Unit test covers service failure

Given `api/src/graphql/apiTokens.test.ts` runs,
When the test named "returns [] when listApiTokens rejects" executes,
Then it mocks `listApiTokens` to reject, invokes the resolver, and asserts the result is deeply equal to `[]`.

#### Scenario: Unit test covers happy path

Given `api/src/graphql/apiTokens.test.ts` runs,
When the test named "returns service result on happy path" executes,
Then it mocks `listApiTokens` to resolve with a two-element array, invokes the resolver, and asserts the result equals that array.

### Requirement: GraphQL responses on /settings are error-free

An E2E spec named `e2e/api-tokens-resolver.spec.ts` MUST assert that no GraphQL response body served during a `/settings` page load contains a `Cannot return null` error or an `errors[]` entry with `path: ["apiTokens"]`. The spec MUST run on every viewport project so mobile and desktop variants of the settings surface are both validated.

#### Scenario: Settings load contains no apiTokens null error

Given an authenticated user,
When they navigate to `/settings` and Playwright captures every GraphQL response body,
Then no response body contains the substring `"Cannot return null for non-nullable field Query.apiTokens"` and no response has an `errors[]` entry whose `path` equals `["apiTokens"]`.

#### Scenario: Spec fails if the regression returns

Given a regression reintroduces a throw path in the `apiTokens` resolver,
When `e2e/api-tokens-resolver.spec.ts` runs against local dev or prod,
Then the spec fails with a clear assertion message naming the offending response body, so the regression is caught before ship.
