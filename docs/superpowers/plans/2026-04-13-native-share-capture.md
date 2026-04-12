# BYOA Native Capture (iOS Shortcut) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an iOS-first native capture flow: tap Share in any iOS app → "BYOA Capture" Shortcut → URL/text/image (optionally with a `#tagged` note) lands as a new Card in BYOA — in ≤3 taps, with no context switch back to the app.

**Architecture:** One new Redwood serverless function at `/functions/capture` authenticated by a hashed personal API token (new `ApiToken` Prisma model). The function re-uses the existing `saveCard` code path via an extracted `createCardForUser()` pure function so both the GraphQL resolver and the capture endpoint share one card-creation path. A new "Mobile Capture" section in Settings lets the user generate + revoke tokens. The iOS Shortcut is distributed once via an iCloud share link and stores the token locally on first run.

**Tech Stack:** RedwoodJS 8.9 (API + Web), Prisma/PostgreSQL (Supabase), Cloudflare R2 (`@aws-sdk/client-s3`) for image uploads, Node.js `crypto` for token generation/hashing, Jest (via `@redwoodjs/testing`) for unit tests, Playwright for E2E, Cypress for settings smoke test, Railway for deploy.

**Spec:** `docs/superpowers/specs/2026-04-13-native-share-capture-design.md`

**Refinement locked during planning:** Endpoint accepts **JSON only** (no multipart). Images are sent as `imageBase64` + `imageMimeType`. This removes the need for a multipart parser dep (`busboy` / `lambda-multipart-parser`) and is natively supported by iOS Shortcuts via the "Base64 Encode" action. Max decoded size: 10 MB.

---

## File Structure

### New files (API)

| Path | Responsibility |
|------|----------------|
| `api/db/migrations/<ts>_api_token/migration.sql` | Prisma migration for `ApiToken` table |
| `api/src/services/apiTokens/apiTokens.ts` | Pure service: generate / verify / revoke / list tokens; shared by GraphQL resolvers and the capture function |
| `api/src/services/apiTokens/apiTokens.test.ts` | Jest unit tests for the service (db mocked) |
| `api/src/graphql/apiTokens.sdl.ts` | GraphQL SDL + resolvers for Settings UI |
| `api/src/lib/rateLimit.ts` | Tiny in-memory sliding-window rate limiter |
| `api/src/lib/rateLimit.test.ts` | Jest unit tests for rate limiter |
| `api/src/functions/capture.ts` | Redwood serverless function — the endpoint |
| `api/src/functions/capture.test.ts` | Jest unit tests covering every response code |

### Modified files (API)

| Path | Change |
|------|--------|
| `api/db/schema.prisma` | Add `ApiToken` model |
| `api/src/services/cards/cards.ts` | Extract `createCardForUser(userId, input)` pure function; resolver delegates to it |
| `api/src/services/cards/cards.test.ts` | **Create** (no tests today) — covers `createCardForUser` |

### New files (Web)

| Path | Responsibility |
|------|----------------|
| `web/src/components/MobileCaptureSection/MobileCaptureSection.tsx` | UI for generate / copy-once / list / revoke |
| `web/src/components/MobileCaptureSection/MobileCaptureSection.test.tsx` | Jest + RTL component tests |
| `web/src/graphql/apiTokens.ts` | Typed GraphQL query + mutations used by the component |

### Modified files (Web)

| Path | Change |
|------|--------|
| `web/src/pages/SettingsPage/SettingsPage.tsx` | Mount `<MobileCaptureSection />` below existing sections |

### New files (E2E + tooling)

| Path | Responsibility |
|------|----------------|
| `e2e/native-capture.spec.ts` | Playwright: login → settings → generate token → direct POST to `/functions/capture` → assert card renders |
| `cypress.config.ts` | Cypress root config (new) |
| `cypress/e2e/native-capture.cy.ts` | Cypress smoke: settings UI generate + revoke round-trip |
| `cypress/support/e2e.ts` | Cypress support file |
| `cypress/support/commands.ts` | Cypress custom commands (login helper) |

### Modified files (tooling)

| Path | Change |
|------|--------|
| `package.json` | Add `cypress` devDep; add scripts `cypress:open`, `cypress:run` |
| `.env.example` | Document `REDWOOD_ENV_BYOA_SHORTCUT_URL` |

---

## Task-by-task

### Task 1: Add `ApiToken` model + migration

**Files:**
- Modify: `api/db/schema.prisma`
- Create: `api/db/migrations/<timestamp>_api_token/migration.sql`

- [ ] **Step 1: Append `ApiToken` model to `schema.prisma`**

Edit `api/db/schema.prisma` and add the following model block after the existing `Card` model (do not modify any existing model):

```prisma
// ─── API Tokens ─────────────────────────────────────────────────────────────
// Personal API tokens used by the iOS "BYOA Capture" Shortcut (and future
// mobile-capture clients) to authenticate against /functions/capture.
// The plaintext secret is shown to the user exactly once at creation time;
// only the sha256 hash is stored at rest.
model ApiToken {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String    @map("user_id")
  name       String
  prefix     String    @unique
  tokenHash  String    @map("token_hash")
  scopes     String[]  @default(["cards:write"])
  lastUsedAt DateTime? @map("last_used_at") @db.Timestamptz
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@index([userId], map: "idx_api_tokens_user")
  @@index([prefix, revokedAt], map: "idx_api_tokens_lookup")
  @@map("api_tokens")
}
```

- [ ] **Step 2: Generate the migration**

Run: `yarn rw prisma migrate dev --name api_token`

Expected output: Prisma applies the migration to the local dev DB and emits SQL in `api/db/migrations/<timestamp>_api_token/migration.sql`. Prisma client regenerates.

- [ ] **Step 3: Sanity-check the generated SQL contains `CREATE TABLE "api_tokens"` with the expected columns and indexes**

Run: `ls api/db/migrations | tail -1`
Then `cat api/db/migrations/<that-dir>/migration.sql`
Expected: `CREATE TABLE "api_tokens"` with `user_id`, `token_hash`, `prefix`, `scopes text[]`, plus the two indexes.

- [ ] **Step 4: Commit**

```bash
git add api/db/schema.prisma api/db/migrations
git commit -m "feat(db): add ApiToken model for mobile capture"
```

---

### Task 2: `apiTokens` service — TDD for pure functions

**Files:**
- Create: `api/src/services/apiTokens/apiTokens.ts`
- Test: `api/src/services/apiTokens/apiTokens.test.ts`

- [ ] **Step 1: Write failing tests**

Create `api/src/services/apiTokens/apiTokens.test.ts`:

```ts
import { generateApiToken, verifyApiToken, revokeApiToken, listApiTokens } from './apiTokens'
import { db } from 'src/lib/db'

jest.mock('src/lib/db', () => ({
  db: {
    apiToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockDb = db as unknown as {
  apiToken: {
    create: jest.Mock
    findFirst: jest.Mock
    findMany: jest.Mock
    update: jest.Mock
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('generateApiToken', () => {
  it('returns plaintext token in byoa_<prefix>_<secret> format', async () => {
    mockDb.apiToken.create.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      name: 'iPhone',
      prefix: 'abcdef01',
      tokenHash: 'hash',
      scopes: ['cards:write'],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })

    const result = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    expect(result.plaintext).toMatch(/^byoa_[a-f0-9]{8}_[a-f0-9]{32}$/)
    expect(result.token.prefix).toBe('abcdef01')
    expect(mockDb.apiToken.create).toHaveBeenCalledTimes(1)
  })

  it('persists only the hash, never the plaintext', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))

    const result = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    const createCall = mockDb.apiToken.create.mock.calls[0][0]
    expect(createCall.data.tokenHash).not.toContain(result.plaintext)
    expect(createCall.data.tokenHash).toHaveLength(64) // sha256 hex
  })
})

describe('verifyApiToken', () => {
  it('returns the token record for a valid plaintext', async () => {
    // generate first to produce a known prefix+hash pair
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))
    const generated = await generateApiToken({ userId: 'user_1', name: 'iPhone' })

    mockDb.apiToken.findFirst.mockImplementation(async ({ where }) => {
      if (
        where.prefix === generated.token.prefix &&
        where.tokenHash === generated.token.tokenHash &&
        where.revokedAt === null
      ) {
        return generated.token
      }
      return null
    })
    mockDb.apiToken.update.mockResolvedValue(generated.token)

    const verified = await verifyApiToken(generated.plaintext)
    expect(verified).not.toBeNull()
    expect(verified?.id).toBe('tok_1')
  })

  it('returns null for a malformed token', async () => {
    expect(await verifyApiToken('not-a-byoa-token')).toBeNull()
    expect(await verifyApiToken('byoa_short_x')).toBeNull()
    expect(mockDb.apiToken.findFirst).not.toHaveBeenCalled()
  })

  it('returns null for a valid-shape token with unknown prefix', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null)
    const token = 'byoa_deadbeef_' + 'a'.repeat(32)
    expect(await verifyApiToken(token)).toBeNull()
  })

  it('returns null for a revoked token (findFirst filter)', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null) // revoked rows filtered out by where clause
    const token = 'byoa_abcdef01_' + 'b'.repeat(32)
    expect(await verifyApiToken(token)).toBeNull()
  })

  it('updates lastUsedAt on successful verify', async () => {
    mockDb.apiToken.create.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }))
    const generated = await generateApiToken({ userId: 'user_1', name: 'iPhone' })
    mockDb.apiToken.findFirst.mockResolvedValue(generated.token)
    mockDb.apiToken.update.mockResolvedValue(generated.token)

    await verifyApiToken(generated.plaintext)

    expect(mockDb.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok_1' },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      })
    )
  })
})

describe('revokeApiToken', () => {
  it('sets revokedAt on the token', async () => {
    mockDb.apiToken.update.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      revokedAt: new Date(),
    })
    await revokeApiToken({ id: 'tok_1', userId: 'user_1' })
    expect(mockDb.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok_1' },
        data: { revokedAt: expect.any(Date) },
      })
    )
  })
})

describe('listApiTokens', () => {
  it('lists only non-revoked tokens for the user, newest first', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([])
    await listApiTokens({ userId: 'user_1' })
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1', revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `yarn rw test api apiTokens --no-watch`
Expected: all tests FAIL with `Cannot find module './apiTokens'` (or equivalent).

- [ ] **Step 3: Write the implementation**

Create `api/src/services/apiTokens/apiTokens.ts`:

```ts
import crypto from 'crypto'

import type { ApiToken } from '@prisma/client'

import { db } from 'src/lib/db'

const TOKEN_REGEX = /^byoa_([a-f0-9]{8})_([a-f0-9]{32})$/

function hashSecret(prefix: string, secret: string): string {
  return crypto.createHash('sha256').update(`${prefix}_${secret}`).digest('hex')
}

export type GenerateApiTokenArgs = {
  userId: string
  name: string
}

export type GeneratedApiToken = {
  token: ApiToken
  plaintext: string
}

export async function generateApiToken({
  userId,
  name,
}: GenerateApiTokenArgs): Promise<GeneratedApiToken> {
  const prefix = crypto.randomBytes(4).toString('hex') // 8 hex chars
  const secret = crypto.randomBytes(16).toString('hex') // 32 hex chars
  const tokenHash = hashSecret(prefix, secret)
  const plaintext = `byoa_${prefix}_${secret}`

  const token = await db.apiToken.create({
    data: {
      userId,
      name,
      prefix,
      tokenHash,
      scopes: ['cards:write'],
    },
  })

  return { token, plaintext }
}

export async function verifyApiToken(plaintext: string): Promise<ApiToken | null> {
  const match = plaintext.match(TOKEN_REGEX)
  if (!match) return null

  const [, prefix, secret] = match
  const tokenHash = hashSecret(prefix, secret)

  const token = await db.apiToken.findFirst({
    where: { prefix, tokenHash, revokedAt: null },
  })

  if (!token) return null

  // Fire-and-forget lastUsedAt update; do not block the caller.
  db.apiToken
    .update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // swallow — non-critical
    })

  return token
}

export type RevokeApiTokenArgs = {
  id: string
  userId: string
}

export async function revokeApiToken({
  id,
  userId,
}: RevokeApiTokenArgs): Promise<ApiToken> {
  return db.apiToken.update({
    where: { id, userId } as any, // composite where typed via Prisma client
    data: { revokedAt: new Date() },
  })
}

export type ListApiTokensArgs = {
  userId: string
}

export async function listApiTokens({ userId }: ListApiTokensArgs): Promise<ApiToken[]> {
  return db.apiToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
}
```

> **Note on `revokeApiToken` where clause:** Prisma `update` requires a unique selector. `id` is unique; ownership is enforced by checking `userId` via a preceding `findFirst`. Simpler pattern:

Replace the `revokeApiToken` body with:

```ts
export async function revokeApiToken({
  id,
  userId,
}: RevokeApiTokenArgs): Promise<ApiToken> {
  const existing = await db.apiToken.findFirst({ where: { id, userId } })
  if (!existing) {
    throw new Error('Token not found')
  }
  return db.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}
```

Update the test mock for `revokeApiToken` accordingly: add a `findFirst` mock returning a fake token, then assert `update` is called. Adjust the test block from Step 1 to:

```ts
describe('revokeApiToken', () => {
  it('sets revokedAt on the token', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue({ id: 'tok_1', userId: 'user_1' })
    mockDb.apiToken.update.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      revokedAt: new Date(),
    })
    await revokeApiToken({ id: 'tok_1', userId: 'user_1' })
    expect(mockDb.apiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok_1' },
        data: { revokedAt: expect.any(Date) },
      })
    )
  })

  it('throws when the token does not belong to the user', async () => {
    mockDb.apiToken.findFirst.mockResolvedValue(null)
    await expect(
      revokeApiToken({ id: 'tok_1', userId: 'user_2' })
    ).rejects.toThrow('Token not found')
    expect(mockDb.apiToken.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn rw test api apiTokens --no-watch`
Expected: all tests PASS (describe blocks: generateApiToken, verifyApiToken, revokeApiToken, listApiTokens).

- [ ] **Step 5: Commit**

```bash
git add api/src/services/apiTokens
git commit -m "feat(api): apiTokens service with generate/verify/revoke/list"
```

---

### Task 3: Extract `createCardForUser` from `saveCard`

**Files:**
- Modify: `api/src/services/cards/cards.ts:135-182`
- Create: `api/src/services/cards/cards.test.ts`

- [ ] **Step 1: Write a failing test for `createCardForUser`**

Create `api/src/services/cards/cards.test.ts`:

```ts
import { createCardForUser } from './cards'
import { db } from 'src/lib/db'
import { enrichCardPipeline } from 'src/services/enrichment/enrichment'

jest.mock('src/lib/db', () => ({
  db: {
    card: {
      create: jest.fn(),
    },
  },
}))

jest.mock('src/services/enrichment/enrichment', () => ({
  enrichCardPipeline: jest.fn().mockResolvedValue(undefined),
}))

const mockDb = db as unknown as {
  card: { create: jest.Mock }
}
const mockEnrich = enrichCardPipeline as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.card.create.mockImplementation(async ({ data }) => ({
    id: 'card_1',
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    archivedAt: null,
    embedding: null,
  }))
})

describe('createCardForUser', () => {
  it('creates a card with userId and default type "website" when none provided', async () => {
    const card = await createCardForUser('user_1', { url: 'https://example.com' })
    expect(card.id).toBe('card_1')
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.userId).toBe('user_1')
    expect(createArg.data.type).toBe('website')
    expect(createArg.data.url).toBe('https://example.com')
  })

  it('honors explicit type, title, content, imageUrl, tags', async () => {
    await createCardForUser('user_1', {
      url: 'https://example.com',
      type: 'article',
      title: 'Hello',
      content: 'Body',
      imageUrl: 'https://r2.example/abc.jpg',
      tags: ['design', 'inspiration'],
    })
    const createArg = mockDb.card.create.mock.calls[0][0]
    expect(createArg.data.type).toBe('article')
    expect(createArg.data.title).toBe('Hello')
    expect(createArg.data.content).toBe('Body')
    expect(createArg.data.imageUrl).toBe('https://r2.example/abc.jpg')
    expect(createArg.data.tags).toEqual(expect.arrayContaining(['design', 'inspiration']))
  })

  it('enqueues enrichment (fire and forget, does not throw if it fails)', async () => {
    mockEnrich.mockRejectedValueOnce(new Error('enrichment blew up'))
    await expect(
      createCardForUser('user_1', { url: 'https://example.com' })
    ).resolves.toBeDefined()
    expect(mockEnrich).toHaveBeenCalledWith('card_1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn rw test api cards --no-watch`
Expected: FAIL — `createCardForUser` is not exported from `./cards`.

- [ ] **Step 3: Refactor `saveCard` to delegate to `createCardForUser`**

Edit `api/src/services/cards/cards.ts`. Replace the existing `saveCard` export (lines 135-182) with the following two exports. Leave all other imports and functions untouched:

```ts
// Shared card-creation path. Called by:
//   1. saveCard GraphQL resolver (user is from context.currentUser)
//   2. /functions/capture endpoint (user is resolved from an ApiToken)
export async function createCardForUser(
  userId: string,
  input: {
    url?: string | null
    type?: string | null
    title?: string | null
    content?: string | null
    imageUrl?: string | null
    tags?: string[] | null
    clientClassification?: unknown
  }
) {
  const clientClassification = normalizeLocalClassification(
    input.clientClassification as any
  )
  const initialLocalState = buildInitialLocalClassificationState({
    inputType: input.type ?? undefined,
    inputTitle: input.title ?? undefined,
    inputTags: input.tags ?? undefined,
    clientClassification,
  })
  const contentLength =
    (input.content?.length || 0) + (initialLocalState.title?.length || 0)
  const timing = createEnrichmentTiming(
    input.url ? detectPlatform(input.url) : input.type || 'generic',
    contentLength,
    !!input.imageUrl
  )

  const card = await db.card.create({
    data: {
      userId,
      type: initialLocalState.type || input.type || 'website',
      title: initialLocalState.title || null,
      content: input.content || null,
      url: input.url || null,
      imageUrl: input.imageUrl || null,
      tags: normalizePersistedTags(initialLocalState.tags),
      metadata: {
        ...initialLocalState.metadata,
        processing: true,
        enrichmentStage: 'queued',
        enrichmentTiming: {
          startedAt: timing.startedAt,
          estimatedTotalMs: timing.estimatedTotalMs,
          platform: timing.platform,
        },
      },
    },
  })

  // Fire and forget. Must not throw from this function if enrichment fails.
  enrichCardPipeline(card.id).catch((err) => {
    logger.error({ cardId: card.id, err }, 'Background enrichment failed')
  })

  return card
}

export const saveCard: MutationResolvers['saveCard'] = async ({ input }) => {
  const userId = context.currentUser!.id
  return createCardForUser(userId, input)
}
```

- [ ] **Step 4: Run test + full api typecheck**

Run: `yarn rw test api cards --no-watch`
Expected: all `createCardForUser` tests PASS.

Run: `yarn rw type-check api`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/cards/cards.ts api/src/services/cards/cards.test.ts
git commit -m "refactor(api): extract createCardForUser so capture fn can reuse it"
```

---

### Task 4: Rate limiter — TDD

**Files:**
- Create: `api/src/lib/rateLimit.ts`
- Test: `api/src/lib/rateLimit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `api/src/lib/rateLimit.test.ts`:

```ts
import { createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
    const now = 1_000_000

    expect(limiter.check('token_1', now)).toEqual({ allowed: true, remaining: 2 })
    expect(limiter.check('token_1', now + 1)).toEqual({ allowed: true, remaining: 1 })
    expect(limiter.check('token_1', now + 2)).toEqual({ allowed: true, remaining: 0 })
  })

  it('rejects the (max+1)th request with retryAfter', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
    const now = 1_000_000

    limiter.check('token_1', now)
    limiter.check('token_1', now + 1)
    limiter.check('token_1', now + 2)

    const result = limiter.check('token_1', now + 3)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(60)
  })

  it('slides the window — old requests age out', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 })
    const now = 1_000_000

    limiter.check('token_1', now)
    limiter.check('token_1', now + 1)
    expect(limiter.check('token_1', now + 2).allowed).toBe(false)

    // Move past the window — first two requests age out
    expect(limiter.check('token_1', now + 60_001).allowed).toBe(true)
  })

  it('isolates per-key — token_1 at limit does not affect token_2', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    const now = 1_000_000

    expect(limiter.check('token_1', now).allowed).toBe(true)
    expect(limiter.check('token_1', now + 1).allowed).toBe(false)

    expect(limiter.check('token_2', now + 2).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn rw test api rateLimit --no-watch`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `api/src/lib/rateLimit.ts`:

```ts
export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfter: number }

export type RateLimiterOptions = {
  windowMs: number
  max: number
}

export type RateLimiter = {
  check: (key: string, nowMs?: number) => RateLimitResult
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = options
  const hits = new Map<string, number[]>()

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitResult {
      const windowStart = nowMs - windowMs
      const existing = hits.get(key) ?? []
      const fresh = existing.filter((t) => t > windowStart)

      if (fresh.length >= max) {
        const oldest = fresh[0]
        const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000))
        hits.set(key, fresh)
        return { allowed: false, remaining: 0, retryAfter }
      }

      fresh.push(nowMs)
      hits.set(key, fresh)
      return { allowed: true, remaining: max - fresh.length }
    },
  }
}

// Shared singleton for the capture endpoint: 120 req/min per token.
export const captureRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn rw test api rateLimit --no-watch`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/rateLimit.ts api/src/lib/rateLimit.test.ts
git commit -m "feat(api): in-memory sliding-window rate limiter"
```

---

### Task 5: `/functions/capture` — JSON body, token auth, rate limit — TDD

**Files:**
- Create: `api/src/functions/capture.ts`
- Test: `api/src/functions/capture.test.ts`

This task covers URL + text + note. Image (base64) is added in Task 6.

- [ ] **Step 1: Write failing tests**

Create `api/src/functions/capture.test.ts`:

```ts
import { handler } from './capture'
import * as apiTokens from 'src/services/apiTokens/apiTokens'
import * as cardsService from 'src/services/cards/cards'
import { captureRateLimiter } from 'src/lib/rateLimit'

jest.mock('src/services/apiTokens/apiTokens')
jest.mock('src/services/cards/cards')

const mockVerify = apiTokens.verifyApiToken as jest.Mock
const mockCreate = cardsService.createCardForUser as jest.Mock

function buildEvent(overrides: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
} = {}) {
  return {
    httpMethod: overrides.method ?? 'POST',
    headers: overrides.headers ?? {},
    body:
      typeof overrides.body === 'string'
        ? overrides.body
        : JSON.stringify(overrides.body ?? {}),
  }
}

function validAuthHeaders() {
  return { authorization: 'Bearer byoa_abcdef01_' + 'a'.repeat(32) }
}

function fakeToken() {
  return { id: 'tok_1', userId: 'user_1', prefix: 'abcdef01' }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Reset the shared rate limiter between tests
  ;(captureRateLimiter as any).__reset?.()
})

describe('capture fn — method + body validation', () => {
  it('returns 405 for non-POST', async () => {
    const res = await handler(buildEvent({ method: 'GET' }))
    expect(res.statusCode).toBe(405)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await handler(buildEvent({ body: { url: 'https://x.com' } }))
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('invalid_token')
  })

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await handler(
      buildEvent({
        headers: { authorization: 'NotBearer xyz' },
        body: { url: 'https://x.com' },
      })
    )
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token does not verify', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://x.com' } })
    )
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('invalid_token')
  })

  it('returns 400 when none of url/text/image provided', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { note: 'just a note' } })
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('missing_input')
  })

  it('returns 400 when body is not valid JSON', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: 'not json at all' })
    )
    expect(res.statusCode).toBe(400)
  })
})

describe('capture fn — happy paths', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })
  })

  it('200 for URL-only', async () => {
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed).toMatchObject({
      ok: true,
      cardId: 'card_1',
      enriching: true,
    })
    expect(mockCreate).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ url: 'https://example.com' })
    )
  })

  it('200 for text-only', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { text: 'selected paragraph from an article' },
      })
    )
    expect(res.statusCode).toBe(200)
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.content).toContain('selected paragraph')
    expect(callArg.type).toBe('note')
  })

  it('200 for url + note with hashtags parsed to tags', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          url: 'https://example.com',
          note: 'loved this read #design #inspiration',
        },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(expect.arrayContaining(['design', 'inspiration']))
    expect(callArg.content).toMatch(/loved this read/)
    expect(callArg.content).not.toMatch(/#design/)
  })

  it('200 for unicode hashtags', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { url: 'https://example.com', note: 'saw this #café #デザイン' },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(expect.arrayContaining(['café', 'デザイン']))
  })
})

describe('capture fn — rate limit', () => {
  it('returns 429 after 120 requests in under a minute', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })

    for (let i = 0; i < 120; i++) {
      const r = await handler(
        buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
      )
      expect(r.statusCode).toBe(200)
    }

    const over = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(over.statusCode).toBe(429)
    expect(JSON.parse(over.body).error).toBe('rate_limited')
  })
})
```

> **Note:** the `__reset` call in `beforeEach` is a test hook. We'll add a simple `reset()` method on the rate limiter in Step 3 so tests don't bleed state. Skip it for now — the test will still work if each test uses a different auth header prefix (which we could do), but a reset is cleaner.

Adjust Task 4's rate limiter to add a `reset()` method. Append this to the rate limiter object and re-run Task 4's tests — it shouldn't break anything because the existing tests don't call `reset`. **This is a small amendment to Task 4** — apply it now.

Edit `api/src/lib/rateLimit.ts` and change the return block of `createRateLimiter` to:

```ts
  return {
    check(key: string, nowMs: number = Date.now()): RateLimitResult {
      const windowStart = nowMs - windowMs
      const existing = hits.get(key) ?? []
      const fresh = existing.filter((t) => t > windowStart)

      if (fresh.length >= max) {
        const oldest = fresh[0]
        const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000))
        hits.set(key, fresh)
        return { allowed: false, remaining: 0, retryAfter }
      }

      fresh.push(nowMs)
      hits.set(key, fresh)
      return { allowed: true, remaining: max - fresh.length }
    },
    reset() {
      hits.clear()
    },
  }
```

And update the `RateLimiter` type:

```ts
export type RateLimiter = {
  check: (key: string, nowMs?: number) => RateLimitResult
  reset: () => void
}
```

Re-run Task 4's tests to confirm they still pass:
`yarn rw test api rateLimit --no-watch`

In the capture test file, replace the reset line in `beforeEach` with:

```ts
  captureRateLimiter.reset()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn rw test api capture --no-watch`
Expected: FAIL — `./capture` module not found.

- [ ] **Step 3: Write the implementation**

Create `api/src/functions/capture.ts`:

```ts
import { verifyApiToken } from 'src/services/apiTokens/apiTokens'
import { createCardForUser } from 'src/services/cards/cards'
import { logger } from 'src/lib/logger'
import { captureRateLimiter } from 'src/lib/rateLimit'

// Unicode-aware hashtag extraction.
const HASHTAG_RE = /#([\p{L}\p{N}_-]+)/gu

type CaptureEvent = {
  httpMethod?: string
  headers?: Record<string, string | undefined>
  body?: string | null
}

type LambdaResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

function json(statusCode: number, payload: unknown): LambdaResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function error(statusCode: number, code: string, extra?: Record<string, unknown>) {
  return json(statusCode, { ok: false, error: code, ...(extra ?? {}) })
}

function extractBearer(headers: Record<string, string | undefined> | undefined): string | null {
  if (!headers) return null
  // Header names are case-insensitive in HTTP; Redwood lowercases them.
  const raw = headers['authorization'] ?? headers['Authorization']
  if (!raw || typeof raw !== 'string') return null
  const match = raw.match(/^Bearer\s+(\S+)$/)
  return match ? match[1] : null
}

function parseBody(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

function parseHashtags(note: string): { tags: string[]; stripped: string } {
  const tags: string[] = []
  const stripped = note
    .replace(HASHTAG_RE, (_, tag: string) => {
      tags.push(tag)
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { tags, stripped }
}

export const handler = async (event: CaptureEvent): Promise<LambdaResponse> => {
  if ((event.httpMethod ?? 'POST').toUpperCase() !== 'POST') {
    return error(405, 'method_not_allowed')
  }

  const plaintext = extractBearer(event.headers)
  if (!plaintext) {
    return error(401, 'invalid_token')
  }

  const token = await verifyApiToken(plaintext)
  if (!token) {
    return error(401, 'invalid_token')
  }

  const rate = captureRateLimiter.check(token.id)
  if (!rate.allowed) {
    return error(429, 'rate_limited', { retryAfter: rate.retryAfter })
  }

  const body = parseBody(event.body)
  if (!body) {
    return error(400, 'invalid_body')
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const note = typeof body.note === 'string' ? body.note : ''

  if (!url && !text /* && !imageBase64 -- added in Task 6 */) {
    return error(400, 'missing_input')
  }

  const { tags, stripped: noteBody } = note ? parseHashtags(note) : { tags: [], stripped: '' }

  // Compose content: prefer explicit `text` (selected-text share), then note body.
  const contentParts: string[] = []
  if (text) contentParts.push(text)
  if (noteBody) contentParts.push(noteBody)
  const content = contentParts.join('\n\n') || null

  const input = {
    url: url || null,
    type: url ? 'website' : 'note',
    content,
    tags: tags.length ? tags : undefined,
  }

  try {
    const card = await createCardForUser(token.userId, input)

    logger.info(
      {
        requestId: `capture_${Date.now()}`,
        tokenPrefix: token.prefix,
        userId: token.userId,
        cardId: card.id,
        inputTypes: {
          url: !!url,
          text: !!text,
          note: !!note,
          image: false,
        },
      },
      'capture ok'
    )

    return json(200, {
      ok: true,
      cardId: card.id,
      enriching: true,
    })
  } catch (err) {
    logger.error({ err, tokenPrefix: token.prefix }, 'capture failed')
    return error(500, 'internal_error')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn rw test api capture --no-watch`
Expected: all non-image tests PASS. (The spec mentioned 10 response codes; we've covered 200, 400, 401, 405, 429 in this task. 413/415/500 for images come in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add api/src/functions/capture.ts api/src/functions/capture.test.ts api/src/lib/rateLimit.ts
git commit -m "feat(api): /functions/capture endpoint with Bearer auth and rate limit"
```

---

### Task 6: Add base64 image support to `/functions/capture`

**Files:**
- Modify: `api/src/functions/capture.ts`
- Modify: `api/src/functions/capture.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `api/src/functions/capture.test.ts`:

```ts
import * as r2 from 'src/lib/r2'
jest.mock('src/lib/r2')
const mockUpload = r2.uploadToR2 as jest.Mock

describe('capture fn — image (base64)', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })
    mockUpload.mockResolvedValue('https://r2.example/tok/card_1.jpg')
  })

  it('200 for image-only: uploads to R2 and sets imageUrl', async () => {
    const tinyJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          imageBase64: tinyJpegBase64,
          imageMimeType: 'image/jpeg',
        },
      })
    )
    expect(res.statusCode).toBe(200)
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [, buffer, contentType] = mockUpload.mock.calls[0]
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(contentType).toBe('image/jpeg')
    const createArg = mockCreate.mock.calls[0][1]
    expect(createArg.imageUrl).toBe('https://r2.example/tok/card_1.jpg')
    expect(createArg.type).toBe('image')
  })

  it('415 when mime type is not image/*', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          imageBase64: Buffer.from('hello').toString('base64'),
          imageMimeType: 'application/pdf',
        },
      })
    )
    expect(res.statusCode).toBe(415)
    expect(JSON.parse(res.body).error).toBe('unsupported_image_type')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('413 when decoded image exceeds 10 MB', async () => {
    // 11 MB of zeros, base64-encoded
    const eleven_mb = Buffer.alloc(11 * 1024 * 1024).toString('base64')
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { imageBase64: eleven_mb, imageMimeType: 'image/jpeg' },
      })
    )
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body).error).toBe('image_too_large')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('400 when imageBase64 is present but not valid base64', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { imageBase64: '!!!not-base64!!!', imageMimeType: 'image/jpeg' },
      })
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('invalid_image')
  })

  it('500 when createCardForUser throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db exploded'))
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toBe('internal_error')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn rw test api capture --no-watch`
Expected: new image describe block FAILS (the logic isn't wired yet).

- [ ] **Step 3: Update `capture.ts` with image handling**

Edit `api/src/functions/capture.ts`. Add this import near the top:

```ts
import { uploadToR2 } from 'src/lib/r2'
```

Add this constant below `HASHTAG_RE`:

```ts
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
```

Add this helper above `handler`:

```ts
function decodeImage(
  imageBase64: unknown,
  imageMimeType: unknown
): { ok: true; buffer: Buffer; contentType: string } | { ok: false; error: string; status: number } {
  if (typeof imageBase64 !== 'string') {
    return { ok: false, error: 'invalid_image', status: 400 }
  }
  if (typeof imageMimeType !== 'string' || !imageMimeType.toLowerCase().startsWith('image/')) {
    return { ok: false, error: 'unsupported_image_type', status: 415 }
  }

  // Quick sanity check before decoding the whole blob
  const estimatedBytes = Math.floor((imageBase64.length * 3) / 4)
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'image_too_large', status: 413 }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(imageBase64, 'base64')
  } catch {
    return { ok: false, error: 'invalid_image', status: 400 }
  }

  // Reject if base64 decodes to something much smaller than the source
  // (heuristic for garbage input that still parses)
  if (buffer.length === 0 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return { ok: false, error: 'invalid_image', status: 400 }
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'image_too_large', status: 413 }
  }

  return { ok: true, buffer, contentType: imageMimeType.toLowerCase() }
}
```

Modify the body of `handler` — after the `parseBody` / `note` parsing block and before the `if (!url && !text)` check — to:

```ts
  let imageUrl: string | null = null
  if (body.imageBase64 !== undefined) {
    const decoded = decodeImage(body.imageBase64, body.imageMimeType)
    if (!decoded.ok) {
      return error(decoded.status, decoded.error)
    }
    const ext = decoded.contentType.split('/')[1] || 'bin'
    const key = `captures/${token.id}/${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`
    try {
      imageUrl = await uploadToR2(key, decoded.buffer, decoded.contentType)
    } catch (err) {
      logger.error({ err, tokenPrefix: token.prefix }, 'r2 upload failed')
      return error(500, 'internal_error')
    }
  }

  if (!url && !text && !imageUrl) {
    return error(400, 'missing_input')
  }
```

Then update the `input` composition to set `imageUrl` and adjust `type`:

```ts
  const input = {
    url: url || null,
    type: imageUrl ? 'image' : url ? 'website' : 'note',
    content,
    imageUrl,
    tags: tags.length ? tags : undefined,
  }
```

And update the log line's `image` flag:

```ts
        inputTypes: { url: !!url, text: !!text, note: !!note, image: !!imageUrl },
```

- [ ] **Step 4: Run tests**

Run: `yarn rw test api capture --no-watch`
Expected: all capture tests pass (including the new image describe block).

- [ ] **Step 5: Commit**

```bash
git add api/src/functions/capture.ts api/src/functions/capture.test.ts
git commit -m "feat(api): capture fn accepts base64 image + R2 upload"
```

---

### Task 7: `apiTokens` GraphQL SDL + resolvers

**Files:**
- Create: `api/src/graphql/apiTokens.sdl.ts`

- [ ] **Step 1: Create the SDL with inline resolvers**

Create `api/src/graphql/apiTokens.sdl.ts`:

```ts
import type { QueryResolvers, MutationResolvers } from 'types/graphql'

import {
  generateApiToken as serviceGenerate,
  listApiTokens as serviceList,
  revokeApiToken as serviceRevoke,
} from 'src/services/apiTokens/apiTokens'

export const schema = gql`
  type ApiToken {
    id: String!
    name: String!
    prefix: String!
    scopes: [String!]!
    createdAt: DateTime!
    lastUsedAt: DateTime
    revokedAt: DateTime
  }

  type GeneratedApiToken {
    token: ApiToken!
    plaintext: String!
  }

  type Query {
    apiTokens: [ApiToken!]! @requireAuth
  }

  type Mutation {
    generateApiToken(name: String!): GeneratedApiToken! @requireAuth
    revokeApiToken(id: String!): ApiToken! @requireAuth
  }
`

export const apiTokens: QueryResolvers['apiTokens'] = async () => {
  const userId = context.currentUser!.id
  return serviceList({ userId })
}

export const generateApiToken: MutationResolvers['generateApiToken'] = async ({
  name,
}) => {
  const userId = context.currentUser!.id
  if (!name || name.trim().length === 0) {
    throw new Error('Token name is required')
  }
  return serviceGenerate({ userId, name: name.trim() })
}

export const revokeApiToken: MutationResolvers['revokeApiToken'] = async ({
  id,
}) => {
  const userId = context.currentUser!.id
  return serviceRevoke({ id, userId })
}
```

- [ ] **Step 2: Generate GraphQL types and verify compile**

Run: `yarn rw g types`
Then: `yarn rw type-check api`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/graphql/apiTokens.sdl.ts
git commit -m "feat(api): apiTokens GraphQL SDL and resolvers"
```

---

### Task 8: `MobileCaptureSection` component — TDD

**Files:**
- Create: `web/src/components/MobileCaptureSection/MobileCaptureSection.tsx`
- Test: `web/src/components/MobileCaptureSection/MobileCaptureSection.test.tsx`
- Create: `web/src/graphql/apiTokens.ts`

- [ ] **Step 1: Create the typed GraphQL operations module**

Create `web/src/graphql/apiTokens.ts`:

```ts
import { gql } from '@redwoodjs/web'

export const API_TOKENS_QUERY = gql`
  query ApiTokensQuery {
    apiTokens {
      id
      name
      prefix
      scopes
      createdAt
      lastUsedAt
      revokedAt
    }
  }
`

export const GENERATE_API_TOKEN_MUTATION = gql`
  mutation GenerateApiTokenMutation($name: String!) {
    generateApiToken(name: $name) {
      plaintext
      token {
        id
        name
        prefix
        createdAt
        lastUsedAt
      }
    }
  }
`

export const REVOKE_API_TOKEN_MUTATION = gql`
  mutation RevokeApiTokenMutation($id: String!) {
    revokeApiToken(id: $id) {
      id
      revokedAt
    }
  }
`
```

- [ ] **Step 2: Write failing component tests**

Create `web/src/components/MobileCaptureSection/MobileCaptureSection.test.tsx`:

```tsx
import { render, screen, waitFor } from '@redwoodjs/testing/web'
import userEvent from '@testing-library/user-event'

import MobileCaptureSection from './MobileCaptureSection'

describe('MobileCaptureSection', () => {
  it('renders the section header and Generate token button', () => {
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    render(<MobileCaptureSection />)
    expect(screen.getByRole('heading', { name: /mobile capture/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate token/i })).toBeInTheDocument()
  })

  it('renders the active token list from the query', async () => {
    mockGraphQLQuery('ApiTokensQuery', () => ({
      apiTokens: [
        {
          id: 'tok_1',
          name: 'iPhone',
          prefix: 'abcdef01',
          scopes: ['cards:write'],
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    }))
    render(<MobileCaptureSection />)
    await waitFor(() => {
      expect(screen.getByText('iPhone')).toBeInTheDocument()
      expect(screen.getByText(/byoa_abcdef01/)).toBeInTheDocument()
    })
  })

  it('generates a token and shows the plaintext exactly once', async () => {
    const user = userEvent.setup()
    mockGraphQLQuery('ApiTokensQuery', () => ({ apiTokens: [] }))
    mockGraphQLMutation('GenerateApiTokenMutation', () => ({
      generateApiToken: {
        plaintext: 'byoa_abcdef01_' + 'a'.repeat(32),
        token: {
          id: 'tok_1',
          name: 'iPhone',
          prefix: 'abcdef01',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      },
    }))

    render(<MobileCaptureSection />)

    await user.click(screen.getByRole('button', { name: /generate token/i }))
    await user.type(screen.getByLabelText(/device name/i), 'iPhone')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText(/byoa_abcdef01_a{32}/)).toBeInTheDocument()
    })
    expect(screen.getByText(/only time you'll see this/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn rw test web MobileCaptureSection --no-watch`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

Create `web/src/components/MobileCaptureSection/MobileCaptureSection.tsx`:

```tsx
import { useState } from 'react'

import { useQuery, useMutation } from '@redwoodjs/web'
import { toast } from '@redwoodjs/web/toast'
import { Smartphone, Copy, Trash2, ExternalLink } from 'lucide-react'

import {
  API_TOKENS_QUERY,
  GENERATE_API_TOKEN_MUTATION,
  REVOKE_API_TOKEN_MUTATION,
} from 'src/graphql/apiTokens'

type ApiTokenRow = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const SHORTCUT_URL = process.env.REDWOOD_ENV_BYOA_SHORTCUT_URL ?? ''

export default function MobileCaptureSection() {
  const { data, refetch } = useQuery<{ apiTokens: ApiTokenRow[] }>(API_TOKENS_QUERY)
  const [generateMutation, { loading: generating }] = useMutation(GENERATE_API_TOKEN_MUTATION)
  const [revokeMutation] = useMutation(REVOKE_API_TOKEN_MUTATION)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deviceName, setDeviceName] = useState('iPhone')
  const [freshPlaintext, setFreshPlaintext] = useState<string | null>(null)

  async function handleCreate() {
    if (!deviceName.trim()) return
    const result = await generateMutation({ variables: { name: deviceName.trim() } })
    const plaintext = result.data?.generateApiToken.plaintext
    if (plaintext) {
      setFreshPlaintext(plaintext)
      await refetch()
    }
  }

  async function handleCopy() {
    if (!freshPlaintext) return
    await navigator.clipboard.writeText(freshPlaintext)
    toast.success('Token copied')
  }

  function handleCloseDialog() {
    setDialogOpen(false)
    setFreshPlaintext(null)
    setDeviceName('iPhone')
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this token? The Shortcut using it will stop working.')) return
    await revokeMutation({ variables: { id } })
    await refetch()
  }

  const tokens = data?.apiTokens ?? []

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-4">
        <Smartphone className="w-5 h-5" />
        <h2 className="text-lg font-display">Mobile Capture</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        Capture from any iOS app via the BYOA Shortcut. Generate a token below, then install the
        Shortcut on your iPhone and paste the token on first run.
      </p>

      {SHORTCUT_URL && (
        <a
          href={SHORTCUT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm underline mb-4"
        >
          <ExternalLink className="w-4 h-4" />
          Download BYOA Shortcut
        </a>
      )}

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="btn-primary"
        >
          Generate token
        </button>
      </div>

      {tokens.length === 0 && (
        <p className="text-sm text-muted">No active tokens yet.</p>
      )}

      {tokens.length > 0 && (
        <ul className="space-y-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between border rounded px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted font-mono">
                  byoa_{t.prefix}_•••••
                </div>
                <div className="text-xs text-muted">
                  {t.lastUsedAt
                    ? `Last used ${new Date(t.lastUsedAt).toLocaleString()}`
                    : 'Never used'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(t.id)}
                className="text-sm inline-flex items-center gap-1 text-red-600"
                aria-label={`Revoke ${t.name}`}
              >
                <Trash2 className="w-4 h-4" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            {!freshPlaintext && (
              <>
                <h3 className="text-lg font-display mb-3">New token</h3>
                <label className="block text-sm mb-1">Device name</label>
                <input
                  className="w-full border rounded px-3 py-2 mb-4"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={handleCloseDialog}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={generating || !deviceName.trim()}
                    className="btn-primary"
                  >
                    Create
                  </button>
                </div>
              </>
            )}

            {freshPlaintext && (
              <>
                <h3 className="text-lg font-display mb-3">Token created</h3>
                <p className="text-sm text-red-600 mb-3">
                  This is the <strong>only time</strong> you&apos;ll see this token. Copy it now and
                  paste it into your BYOA Shortcut.
                </p>
                <div className="border rounded bg-gray-50 p-3 font-mono text-xs break-all mb-3">
                  {freshPlaintext}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                  <button type="button" onClick={handleCloseDialog} className="btn-primary">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Run component tests**

Run: `yarn rw test web MobileCaptureSection --no-watch`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MobileCaptureSection web/src/graphql/apiTokens.ts
git commit -m "feat(web): MobileCaptureSection component with token generation UX"
```

---

### Task 9: Mount `MobileCaptureSection` on the Settings page

**Files:**
- Modify: `web/src/pages/SettingsPage/SettingsPage.tsx`

- [ ] **Step 1: Import and render the section**

Edit `web/src/pages/SettingsPage/SettingsPage.tsx`. Add the import near the top (alongside the other component imports):

```tsx
import MobileCaptureSection from 'src/components/MobileCaptureSection/MobileCaptureSection'
```

Then, inside the JSX returned by `SettingsPage`, add `<MobileCaptureSection />` **after** the existing `<ExportBuilder />` mount (search for `<ExportBuilder` to find the location). If `<ExportBuilder />` is not mounted in this file, add it after the last themed section and before the logout section.

If you cannot locate an obvious place, add it near the end of the returned JSX tree inside the top-level container `<div>`:

```tsx
<MobileCaptureSection />
```

- [ ] **Step 2: Run the web type-check and dev server smoke**

Run: `yarn rw type-check web`
Expected: no errors.

Run: `yarn rw dev` in the background, then visit `http://localhost:8910/settings` and confirm the "Mobile Capture" section renders with the Generate token button. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/SettingsPage/SettingsPage.tsx
git commit -m "feat(web): mount MobileCaptureSection on Settings page"
```

---

### Task 10: Playwright E2E — end-to-end capture roundtrip

**Files:**
- Create: `e2e/native-capture.spec.ts`

- [ ] **Step 1: Read existing fixtures**

Run: `cat e2e/support/fixtures.ts` and note:
- `login(page, testUser)` signature
- `testUser` fixture shape
- `saveLink` helper

- [ ] **Step 2: Write the test**

Create `e2e/native-capture.spec.ts`:

```ts
import { expect, login, test } from './support/fixtures'

test.describe('Native capture — Settings + endpoint roundtrip', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await login(page, testUser)
  })

  test('generate a token, POST to /functions/capture, see the card in /home', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/settings')

    // Mobile Capture section is visible
    await expect(page.getByRole('heading', { name: /mobile capture/i })).toBeVisible({
      timeout: 5000,
    })

    // Open the dialog
    await page.getByRole('button', { name: /generate token/i }).click()
    await page.getByLabel(/device name/i).fill('Playwright iPhone')
    await page.getByRole('button', { name: /^create$/i }).click()

    // Capture the plaintext token from the dialog
    const plaintext = await page.locator('text=/byoa_[a-f0-9]{8}_[a-f0-9]{32}/').innerText()
    expect(plaintext).toMatch(/^byoa_[a-f0-9]{8}_[a-f0-9]{32}$/)

    await page.getByRole('button', { name: /^done$/i }).click()

    // Active token row appears
    await expect(page.getByText('Playwright iPhone')).toBeVisible()

    // Fire the capture endpoint directly (simulating the Shortcut)
    const captureUrl = new URL('/.redwood/functions/capture', baseURL!).toString()
    const captureResponse = await request.post(captureUrl, {
      headers: { Authorization: `Bearer ${plaintext}` },
      data: {
        url: 'https://example.com/playwright-capture-test',
        note: 'e2e capture #playwright #automation',
      },
    })
    expect(captureResponse.status()).toBe(200)
    const captureJson = await captureResponse.json()
    expect(captureJson.ok).toBe(true)
    expect(captureJson.cardId).toBeTruthy()

    // Visit /home and assert the card lands (title may still be enriching — URL is what we check)
    await page.goto('/home')
    await expect(
      page.locator('a[href*="example.com/playwright-capture-test"]').first()
    ).toBeVisible({ timeout: 10_000 })

    // Revoke the token and confirm a subsequent POST returns 401
    await page.goto('/settings')
    await page.getByRole('button', { name: /revoke playwright iphone/i }).click()
    // Handle the confirm() dialog
    page.once('dialog', (d) => d.accept())

    const afterRevoke = await request.post(captureUrl, {
      headers: { Authorization: `Bearer ${plaintext}` },
      data: { url: 'https://example.com/should-fail' },
    })
    expect(afterRevoke.status()).toBe(401)
  })
})
```

- [ ] **Step 3: Run the Playwright test**

Start the dev server in one terminal: `yarn rw dev`
In another, run: `yarn playwright test e2e/native-capture.spec.ts --project="Mobile Safari"`

Expected: test PASSES. If it fails because of the confirm() dialog, move the `page.once('dialog', ...)` line **before** clicking the Revoke button.

- [ ] **Step 4: Commit**

```bash
git add e2e/native-capture.spec.ts
git commit -m "test(e2e): Playwright native-capture roundtrip"
```

---

### Task 11: Cypress install + settings UI smoke

**Files:**
- Create: `cypress.config.ts`
- Create: `cypress/e2e/native-capture.cy.ts`
- Create: `cypress/support/e2e.ts`
- Create: `cypress/support/commands.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Cypress as a dev dependency**

Run: `yarn add -D cypress`
Expected: Cypress 13+ installed to `node_modules/cypress`, added to `package.json` devDependencies.

- [ ] **Step 2: Add scripts to the root `package.json`**

Edit `package.json` and add the following under `"scripts"`:

```json
"cypress:open": "cypress open",
"cypress:run": "cypress run"
```

- [ ] **Step 3: Create Cypress config**

Create `cypress.config.ts`:

```ts
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8910',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    viewportWidth: 390,
    viewportHeight: 844,
  },
})
```

- [ ] **Step 4: Create Cypress support files**

Create `cypress/support/e2e.ts`:

```ts
import './commands'
```

Create `cypress/support/commands.ts`:

```ts
/// <reference types="cypress" />

// Placeholder: real login wiring can reuse a seeded Supabase session cookie.
// For v1, the test logs in via the UI.
Cypress.Commands.add('loginViaUi', (email: string, password: string) => {
  cy.visit('/login')
  cy.get('input[type="email"]').type(email)
  cy.get('input[type="password"]').type(password)
  cy.get('button[type="submit"]').click()
  cy.url().should('not.include', '/login')
})

declare global {
  namespace Cypress {
    interface Chainable {
      loginViaUi(email: string, password: string): Chainable<void>
    }
  }
}

export {}
```

- [ ] **Step 5: Write the smoke test**

Create `cypress/e2e/native-capture.cy.ts`:

```ts
describe('Native Capture — Settings UI smoke', () => {
  beforeEach(() => {
    const email = Cypress.env('TEST_USER_EMAIL')
    const password = Cypress.env('TEST_USER_PASSWORD')
    if (!email || !password) {
      throw new Error(
        'Set CYPRESS_TEST_USER_EMAIL and CYPRESS_TEST_USER_PASSWORD in env before running'
      )
    }
    cy.loginViaUi(email, password)
  })

  it('generates then revokes a token', () => {
    cy.visit('/settings')
    cy.contains('h2', /mobile capture/i).should('be.visible')
    cy.contains('button', /generate token/i).click()
    cy.get('input').first().clear().type('Cypress iPhone')
    cy.contains('button', /^create$/i).click()
    cy.contains(/byoa_[a-f0-9]{8}_[a-f0-9]{32}/).should('be.visible')
    cy.contains('button', /^done$/i).click()
    cy.contains('Cypress iPhone').should('be.visible')

    // Revoke
    cy.on('window:confirm', () => true)
    cy.contains('button', /revoke/i).first().click()
    cy.contains('Cypress iPhone').should('not.exist')
  })
})
```

- [ ] **Step 6: Run Cypress**

Run: `yarn rw dev` in one terminal, then in another:

```bash
CYPRESS_TEST_USER_EMAIL="$TEST_USER_EMAIL" \
CYPRESS_TEST_USER_PASSWORD="$TEST_USER_PASSWORD" \
yarn cypress:run
```

Expected: test PASSES.

- [ ] **Step 7: Commit**

```bash
git add cypress.config.ts cypress package.json
git commit -m "test(cypress): settings UI smoke for native capture"
```

---

### Task 12: Env var documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the Shortcut URL env var**

Append to `.env.example`:

```bash
# Public iCloud share link to the BYOA Capture Shortcut. Displayed on the
# Settings > Mobile Capture section so users can install the Shortcut.
REDWOOD_ENV_BYOA_SHORTCUT_URL=""
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add REDWOOD_ENV_BYOA_SHORTCUT_URL to env example"
```

---

### Task 13: Full test suite green check + HALT for Chrome DevTools MCP verification

**Files:** none

- [ ] **Step 1: Run all api jest tests**

Run: `yarn rw test api --no-watch`
Expected: **green** — apiTokens + cards + rateLimit + capture all pass.

- [ ] **Step 2: Run all web jest tests**

Run: `yarn rw test web --no-watch`
Expected: **green** — MobileCaptureSection tests pass + existing suite unaffected.

- [ ] **Step 3: Run Playwright**

Start dev: `yarn rw dev` (leave running in background)
Run: `yarn playwright test`
Expected: all existing tests + the new native-capture test pass.

- [ ] **Step 4: Run Cypress**

Run: `yarn cypress:run` with the env vars from Task 11 Step 6.
Expected: native-capture.cy.ts passes.

- [ ] **Step 5: Type-check both sides**

Run: `yarn rw type-check`
Expected: no errors on api or web.

- [ ] **Step 6: HALT — hand off to user for Chrome DevTools MCP verification**

At this point, stop executing. Report to the user:

> "Reached the **Chrome DevTools MCP testing phase**. All jest/playwright/cypress tests are green. I'm halting here per your instruction. When you're ready, say 'verify with chrome-devtools' and I'll resume with the browser-testing-with-devtools skill and run a live verification pass against the local dev server (or production after deploy)."

---

## Out-of-scope for this plan (from spec §13)

- Android / desktop PWA share-target
- Browser bookmarklet
- Native iOS Share Extension via Capacitor
- Per-scope tokens beyond `cards:write`
- Webhook delivery
- Siri voice capture

These can be follow-on plans once the core v1 is validated.

---

**End of plan.**
