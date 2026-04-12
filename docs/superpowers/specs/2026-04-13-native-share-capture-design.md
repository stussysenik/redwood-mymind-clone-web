# BYOA Native Capture (iOS Shortcut) — Design Spec

**Date:** 2026-04-13
**Author:** senik + Claude
**Status:** Approved for implementation planning
**Scope:** v1 — iOS primary, URL + text + image inputs, Personal API Token auth

---

## 1. Problem

Today, saving anything to BYOA requires: leave current app → open BYOA → Cmd+I → paste URL → Enter. Too many steps and too much context switching. Goal: from *any* iOS app's native share sheet, push content into BYOA in ~2 taps, with an optional one-field note.

The north star is: **reading an article in Safari → tap Share → tap BYOA → (optionally type a note) → banner "Saved" → back to reading.** Total friction ≤3 taps.

## 2. Non-goals (explicit YAGNI)

- Android / desktop / browser extension (iOS-only v1)
- Native iOS app (Capacitor, Expo, or Share Extension)
- Token scopes beyond `cards:write`
- Token expiry (manual revoke only)
- Multi-instance distributed rate limiting (single Railway instance today)
- Auto-generated per-user `.shortcut` binaries with embedded tokens (security risk)
- OAuth / PKCE device flow
- Retry/resume/durability (existing enrichment pipeline is already fire-and-forget)

## 3. Architecture

```
┌────────────────┐
│  Any iOS app   │
│  (Safari, IG…) │
└───────┬────────┘
        │ tap Share → "BYOA Capture" Shortcut
        ▼
┌──────────────────────────────────┐
│     BYOA Capture Shortcut        │
│  1. Read Shortcut Input (URL /   │
│     text / image)                │
│  2. Ask For Input "Note / #tags" │
│     (optional, allow empty)      │
│  3. Build multipart or JSON body │
│  4. POST with Bearer <token>     │
└───────────────┬──────────────────┘
                │ HTTPS POST
                ▼
┌───────────────────────────────────────────────────┐
│ /.redwood/functions/capture (Redwood serverless)  │
│                                                   │
│   1. verifyApiToken(prefix, secret)               │
│   2. rate limit (120 req/min/token, in-memory)    │
│   3. if image → upload to R2 → imageUrl           │
│   4. parse #tags from note → tags[]               │
│   5. createCardForUser(userId, input)             │
│        └─ shared with saveCard GQL resolver       │
│   6. return { ok, cardId, url, enriching: true }  │
└───────────────┬───────────────────────────────────┘
                │ fire-and-forget (no change)
                ▼
     enrichCardPipeline(cardId)  ← existing
```

## 4. Data model

### 4.1 New Prisma model — `ApiToken`

```prisma
model ApiToken {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  prefix      String    @unique
  tokenHash   String
  scopes      String[]  @default(["cards:write"])
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([userId])
  @@index([prefix, revokedAt])
}
```

**Token format:** `byoa_<8-hex-prefix>_<32-hex-secret>`

- `prefix` is indexed, used for lookup (unique)
- `tokenHash = sha256(prefix + "_" + secret)`
- The full secret is shown to the user **once** at generation time and never persisted
- Revocation sets `revokedAt` (soft delete; preserved for audit)

### 4.2 Why SHA-256, not bcrypt/argon2

These are high-entropy random secrets (128 bits), not user-chosen passwords. SHA-256 is the correct primitive — bcrypt/argon2 defend against weak passwords, which is not the threat here. GitHub, Stripe, and Vercel all use this approach for API tokens.

## 5. Endpoint contract

### 5.1 Route

`POST https://mymind-clone-production.up.railway.app/.redwood/functions/capture`

### 5.2 Headers

```
Authorization: Bearer byoa_<prefix>_<secret>
Content-Type:  application/json   OR   multipart/form-data
```

### 5.3 Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | string | no | The shared URL |
| `text` | string | no | Selected text from share sheet |
| `note` | string | no | User's quick thought; `#tags` parsed out |
| `image` | file | no | Multipart only; photo/screenshot |

**Validation:** at least one of `url`, `text`, `image` must be present. `note` alone → 400.

**Hashtag parsing:** `/#([\p{L}\p{N}_-]+)/gu` → `tags[]`. The note minus hashtags → `card.content`.

**Image constraints:** max 10 MB, MIME type starts with `image/`. Uploaded to R2 via existing storage module; result URL stored in `card.imageUrl`.

### 5.4 Responses

**200 OK**
```json
{
  "ok": true,
  "cardId": "clxyz123",
  "url": "https://mymind-clone-production.up.railway.app/card/clxyz123",
  "enriching": true
}
```

**Error responses**

| Status | `error` code | Cause |
|--------|--------------|-------|
| 400 | `missing_input` | None of url/text/image provided |
| 401 | `invalid_token` | Token format bad or prefix not found |
| 401 | `revoked` | Token found but `revokedAt` set |
| 413 | `image_too_large` | Image > 10 MB |
| 415 | `unsupported_image_type` | MIME not `image/*` |
| 429 | `rate_limited` | Token exceeded 120 req/min; includes `retryAfter` seconds |
| 500 | `internal_error` | Unexpected — logged with request ID |

All error bodies: `{ "ok": false, "error": "<code>", "message"?: "..." }`

### 5.5 Rate limiting

Sliding window, 120 req/min/token, in-memory (`Map<tokenId, number[]>` of timestamps). Cleaned opportunistically on each request. Single Railway instance assumption — revisit if/when we scale out.

### 5.6 Shared card creation path

Extract the body of the current `saveCard` GraphQL resolver (`api/src/services/cards/cards.ts:135-182`) into a pure function:

```ts
// api/src/services/cards/cards.ts
export async function createCardForUser(
  userId: string,
  input: SaveCardInput,
): Promise<Card> { /* existing logic */ }
```

Both `saveCard` resolver and `/functions/capture` call this. Guarantees zero logic drift between the two entry points.

## 6. Settings UI

### 6.1 Location

New section on existing `SettingsPage` titled **"Mobile Capture"**.

### 6.2 Components

- **Header text:** "Capture from any iOS app via the BYOA Shortcut. Generate a token below, then install the Shortcut."
- **Download Shortcut button** — opens iCloud share link (`REDWOOD_ENV_BYOA_SHORTCUT_URL`, set manually once after the Shortcut is built)
- **Generate token** — opens a dialog asking for a label (default "iPhone"). On confirm, calls `generateApiToken` mutation and displays the resulting full token in a monospace box with a Copy button and the warning: *"This is the only time you'll see this token. Copy it now and paste it into your BYOA Shortcut."*
- **Active tokens list** — each row: `name`, masked prefix (`byoa_a1b2c3d4_•••••`), `Created`, `Last used`, **Revoke** button
- **Revoked tokens:** hidden by default, toggle "Show revoked"

### 6.3 GraphQL (new `apiTokens.sdl.ts`)

```graphql
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
  plaintext: String!   # returned once, never persisted
}

type Query {
  apiTokens: [ApiToken!]! @requireAuth
}

type Mutation {
  generateApiToken(name: String!): GeneratedApiToken! @requireAuth
  revokeApiToken(id: String!): ApiToken! @requireAuth
}
```

All `@requireAuth` — these are operated from inside a logged-in Supabase session.

## 7. iOS Shortcut design

### 7.1 Distribution

A single, generic `.shortcut` file is built manually (not auto-generated per user) and shared via an iCloud link. The iCloud URL is stored in `REDWOOD_ENV_BYOA_SHORTCUT_URL` so the Settings page can link to it. No secret data is baked into the shared Shortcut.

### 7.2 Shortcut steps

1. **If** "Token" text variable is empty → **Ask For Input** "Paste your BYOA API token" → store in "Token" variable (persists across runs)
2. **Get Shortcut Input** (accept: URLs, Text, Images, Media)
3. **Ask For Input** "Note / #tags (optional)" → store in "Note" variable; allow empty
4. **Dictionary build:**
   - if input is an Image → build multipart form-data with `image` field + optional `url`/`text`/`note`
   - else → build JSON with `url`/`text`/`note`
5. **Get Contents of URL** — POST to `https://mymind-clone-production.up.railway.app/.redwood/functions/capture`
   - Headers: `Authorization: Bearer {{Token}}`, `Content-Type` appropriate
   - Body: dictionary from step 4
6. **If** HTTP status is 2xx → **Show Notification** "Saved to BYOA ✓"
7. **Else** → **Show Notification** "BYOA save failed: {{error}}"

### 7.3 Pinned to share sheet

The Shortcut's settings enable "Show in Share Sheet" with accepted input types: URL, Text, Images, Rich Text, Web Page. This makes it appear natively in any app's share sheet.

## 8. Files to create / modify

### 8.1 API (`api/`)

| File | Action | Purpose |
|------|--------|---------|
| `api/db/schema.prisma` | modify | add `ApiToken` model |
| `api/db/migrations/<timestamp>_api_token/migration.sql` | create | Prisma migration |
| `api/src/services/apiTokens/apiTokens.ts` | create | generate/verify/revoke/list pure functions |
| `api/src/services/apiTokens/apiTokens.test.ts` | create | Jest unit tests |
| `api/src/graphql/apiTokens.sdl.ts` | create | GraphQL schema + resolvers |
| `api/src/services/cards/cards.ts` | modify | extract `createCardForUser(userId, input)` |
| `api/src/services/cards/cards.test.ts` | modify | test extracted function directly |
| `api/src/functions/capture.ts` | create | Redwood serverless function (the endpoint) |
| `api/src/functions/capture.test.ts` | create | Jest unit tests covering all response cases |
| `api/src/lib/rateLimit.ts` | create | small in-memory sliding window helper |
| `api/src/lib/rateLimit.test.ts` | create | Jest unit tests |

### 8.2 Web (`web/`)

| File | Action | Purpose |
|------|--------|---------|
| `web/src/pages/SettingsPage/SettingsPage.tsx` | modify | mount `<MobileCaptureSection />` |
| `web/src/pages/SettingsPage/MobileCaptureSection.tsx` | create | the UI described in §6 |
| `web/src/pages/SettingsPage/MobileCaptureSection.test.tsx` | create | Jest + RTL component tests |
| `web/src/graphql/apiTokens.ts` | create | typed GQL queries/mutations for the UI |

### 8.3 Tests (E2E)

| File | Action | Purpose |
|------|--------|---------|
| `e2e/native-capture.spec.ts` | create | Playwright: login → settings → generate token → POST /capture → assert card |
| `cypress.config.ts` | create | new Cypress config |
| `cypress/e2e/native-capture.cy.ts` | create | Cypress: settings UI smoke (generate + revoke) |
| `package.json` | modify | add Cypress dev dependency |

### 8.4 Infra

| File | Action | Purpose |
|------|--------|---------|
| `.env.example` | modify | document `REDWOOD_ENV_BYOA_SHORTCUT_URL` |

## 9. Testing strategy

### 9.1 Jest (unit) — API

- `apiTokens.test.ts`
  - `generate` produces `byoa_<8hex>_<32hex>` format, stores hash not plaintext, returns plaintext once
  - `verify` happy path, unknown prefix → null, wrong secret → null, revoked → null
  - `revoke` sets `revokedAt`, is idempotent
  - `list` filters out `revokedAt` by default
  - `updateLastUsedAt` is called on successful verify
- `capture.test.ts` — table-driven for response cases:
  - 200: URL-only, text-only, image-only, URL+text+note with hashtags, all three
  - 200: hashtag parsing (`#Design`, `#design`, `#with-dash`, `#emoji🎨` → Unicode-aware)
  - 400: missing all inputs
  - 401: missing `Authorization` header
  - 401: malformed token format
  - 401: valid format but prefix not found
  - 401: revoked token
  - 413: image > 10 MB (mocked file size)
  - 415: non-image mime
  - 429: after 120 requests in a rolling 60s window
  - 500: `createCardForUser` throws → wrapped, request ID logged
- `rateLimit.test.ts`
  - allows first 120, rejects 121st
  - window slides (wait past 60s → accepts again)
  - per-token isolation (token A at limit does not affect token B)

### 9.2 Jest (unit) — Web

- `MobileCaptureSection.test.tsx`
  - Generate dialog opens, validates non-empty name, calls mutation, displays plaintext once
  - Copy button copies plaintext to clipboard (mock `navigator.clipboard.writeText`)
  - Token is hidden after closing the dialog (not re-rendered)
  - Active token list renders fixture data
  - Revoke button calls mutation and removes from list

### 9.3 Playwright (E2E)

- `e2e/native-capture.spec.ts`
  1. Login via Supabase magic link / seeded session
  2. Navigate to Settings → Mobile Capture
  3. Click **Generate token**, fill name "Playwright iPhone", confirm
  4. Read the plaintext token from the dialog
  5. Close dialog
  6. In the same test, `request.post('/.redwood/functions/capture', …)` with the token, URL-only body
  7. Assert 200, capture `cardId`
  8. Navigate `/home`, assert card visible with that ID
  9. Navigate back to Settings, revoke the token
  10. Retry the same POST → assert 401 `revoked`

### 9.4 Cypress (E2E smoke)

- `cypress/e2e/native-capture.cy.ts`
  1. Login via seeded session
  2. Visit `/settings`
  3. Generate token, assert dialog shows plaintext
  4. Close, assert token appears in active list
  5. Click Revoke, confirm it disappears
  6. **Does not** hit the `/capture` endpoint — Playwright covers that

(Cypress exists to satisfy the explicit Jest+Playwright+Cypress ask; its scope is intentionally narrow to avoid doubling Playwright.)

### 9.5 Chrome DevTools MCP — final manual verification

Deferred. When all of the above pass, halt and ask the user to invoke the chrome-devtools phase. Checks to run at that time:
- Real browser session against production deployment
- Settings UI renders + accessible
- Token copy interaction works with real clipboard
- `curl -X POST` from terminal with real token → real card appears in live `/home`
- Network tab shows 200 with expected response shape
- Console clean (no warnings, no errors)

## 10. Security considerations

- **Token at rest:** only hash stored; plaintext shown exactly once; `prefix` enables O(1) lookup without exposing the secret
- **Transport:** HTTPS only (Railway terminates TLS at edge)
- **Revocation:** immediate — `verify` checks `revokedAt IS NULL` in the same query
- **Scope:** `cards:write` only; no read, no user info, no destructive ops
- **Rate limit:** mitigates brute-force attempts and abuse
- **Audit:** `lastUsedAt` updated on each successful verify
- **No token in logs:** log only the prefix, never the plaintext or hash
- **Image upload:** validated MIME + size before touching R2
- **CORS:** function is not called from browser; no CORS headers needed (in fact we do not want them)
- **No CSRF risk:** bearer auth, not cookie auth
- **No token in URL:** only in `Authorization` header

## 11. Observability

- Structured log on every capture request: `{ requestId, tokenPrefix, userId, inputTypes, responseCode, latencyMs }`
- Never log the plaintext token or hash
- On 500, include stack trace in logs but return generic error to client
- Existing Railway logs are enough for v1; no new telemetry pipeline

## 12. Rollout plan

1. Ship API changes + Settings UI behind a `CAPTURE_ENABLED` env flag defaulted off
2. Flip flag in Railway for staging preview (or directly in production since this is a solo app)
3. Build and install the Shortcut once from my own device
4. Generate a token, paste into Shortcut
5. Capture a real URL from Safari and verify it lands in /home
6. Capture a real screenshot from Photos and verify the image renders
7. Capture selected text from an article and verify note + tags parse
8. Then run the Chrome DevTools MCP verification pass
9. Document the setup in README or PROGRESS.md

## 13. Out-of-scope follow-ups (maybe later)

- Android Chrome PWA share target
- Browser bookmarklet for desktop Chrome
- Real Share Extension via Capacitor wrapper (iOS UI fidelity)
- Per-scope tokens (`cards:read`, `tags:write`)
- Webhook delivery of capture events to external automations
- Siri voice capture via Shortcut phrase

---

**End of design spec.**
