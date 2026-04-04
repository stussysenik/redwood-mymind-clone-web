## Capability: passkey-auth

WebAuthn passkey registration, authentication, and credential management with email/password as recovery fallback.

## Behavior

### Registration Flow
1. Authenticated user navigates to Settings → Security.
2. Clicks "Add Passkey." System calls `/api/auth/passkey/register-options` which generates a WebAuthn challenge via `@simplewebauthn/server` `generateRegistrationOptions()`.
3. Browser invokes `navigator.credentials.create()` via `@simplewebauthn/browser` `startRegistration()`. On iPhone, this triggers Face ID / Touch ID via iCloud Keychain.
4. Browser returns attestation to `/api/auth/passkey/register-verify`. Server calls `verifyRegistrationResponse()`, stores the credential public key in the `Credential` table.
5. User sees "Passkey added" confirmation. Can register multiple passkeys (e.g., iPhone + MacBook).

### Authentication Flow
1. User visits `/login`. Primary CTA is "Sign in with Passkey."
2. Click triggers `/api/auth/passkey/login-options` → `generateAuthenticationOptions()` with `userVerification: 'preferred'`.
3. Browser invokes `navigator.credentials.get()` → Face ID / biometric prompt.
4. Assertion sent to `/api/auth/passkey/login-verify` → `verifyAuthenticationResponse()`.
5. On success, server mints a custom JWT signed with `SUPABASE_JWT_SECRET` containing `sub` (user UUID), `email`, `role: 'authenticated'`, and `exp` (1 hour). This matches the Supabase JWT shape that `api/src/functions/graphql.ts` already decodes, so the rest of the app works unchanged.
6. Secondary link: "Use email instead" → existing email/password flow.

### Credential Management
- Settings → Security lists all registered passkeys with device name and last-used date.
- User can delete individual passkeys.
- At least one auth method must remain (can't delete last passkey if no email/password set).

## Data Model

```prisma
model Credential {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId          String   @map("user_id")
  credentialId    String   @unique @map("credential_id")
  publicKey       Bytes    @map("public_key")
  counter         BigInt   @default(0)
  deviceType      String   @map("device_type")     // "singleDevice" | "multiDevice"
  backedUp        Boolean  @default(false)
  transports      String[] @default([])             // "internal", "usb", "ble", "nfc"
  deviceName      String?  @map("device_name")
  lastUsedAt      DateTime? @map("last_used_at") @db.Timestamptz
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([userId], map: "idx_credentials_user_id")
  @@map("credentials")
}

// Note: No Prisma @relation to User model because users are managed by
// Supabase Auth (not a Prisma User model). The userId FK references
// auth.users.id and is enforced at the database level via raw SQL migration.

```

## API Endpoints

Four new API function endpoints (not GraphQL — WebAuthn requires direct HTTP for challenge/response):

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/passkey/register-options` | POST | @requireAuth | Generate registration challenge |
| `/api/auth/passkey/register-verify` | POST | @requireAuth | Verify attestation, store credential |
| `/api/auth/passkey/login-options` | POST | Public | Generate authentication challenge |
| `/api/auth/passkey/login-verify` | POST | Public | Verify assertion, mint session |

Challenge state stored in an in-memory Map on the API server (TTL 60s, auto-evicted). For multi-instance Railway deploys, upgrade to a `WebAuthnChallenge` Supabase table with TTL cleanup via `pg_cron` or application-level expiry check. Single-instance is sufficient for current scale.

## Dependencies

- `@simplewebauthn/server@^13` (API side)
- `@simplewebauthn/browser@^13` (Web side)

## Files Changed

| File | Change |
|------|--------|
| `api/db/schema.prisma` | Add `Credential` model |
| `api/src/functions/passkey.ts` | New — 4 endpoint handlers |
| `web/src/pages/LoginPage/LoginPage.tsx` | Add passkey sign-in button, secondary email link |
| `web/src/pages/SettingsPage/SettingsPage.tsx` | Add Security section with passkey management |
| `web/src/lib/passkey.ts` | New — browser-side WebAuthn helpers |

## Acceptance Criteria

- [ ] User can register a passkey via Face ID on iPhone Safari.
- [ ] User can sign in with passkey — no password typed.
- [ ] Email/password login still works as fallback.
- [ ] Settings shows registered passkeys with delete option.
- [ ] Deleting last passkey is blocked if no email/password exists.
- [ ] WebAuthn challenge expires after 60 seconds.
- [ ] Counter incremented on each authentication to detect cloned keys.
