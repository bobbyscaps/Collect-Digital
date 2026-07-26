# Wallet Registration, Ownership Verification, and First Inventory Sync (PR9)

PR9 turns the Verify Wallet action into a complete authenticated user flow.
It connects the Collector Identity UI to the wallet registry (PR3), ownership
verification (PR4), inventory sync (PR5), analysis (PR6), and profile / identity
read models (PR7–PR8).

## User flow

```
Connect or select wallet
        ↓
Register wallet          POST /api/wallets/register
        ↓
Generate challenge       POST /api/wallets/verification/challenge
        ↓
Sign canonical message   Privy wallet.sign / Solana signMessage
        ↓
Verify signature         POST /api/wallets/verification/verify
        ↓
First inventory sync     POST /api/wallets/inventory/sync
        ↓
Refresh Collector Identity   GET /api/collector-identity/me
```

The user never needs to understand these backend layers. The UI shows truthful
phases only (ready → registering → awaiting signature → verifying →
synchronizing → complete), with explicit cancellation, verification-failure,
and sync-failure states.

## Registration is not verification

`POST /api/wallets/register`:

- Requires a verified Privy Bearer token
- Derives `profileId` only from trusted server auth
- Normalizes the address (`eip155` lowercase, `solana` case-preserving)
- Creates or reuses the `profile_wallets` row for that profile
- Preserves existing wallet role
- Leaves `verificationStatus` as `pending` (or existing status on reuse)
- Rejects wallets owned by another profile
- Does **not** mark the wallet verified

Login alone never implies ownership verification.

## Ownership verification uses message signing

`POST /api/wallets/verification/challenge` returns a **canonical** Collect Digital
message built server-side from the persisted challenge + wallet rows.

The client asks the connected Privy wallet to **sign that message only**:

| Namespace | API |
|-----------|-----|
| EVM (`eip155`) | Connected wallet `sign(message)` (`personal_sign`) |
| Solana | `@privy-io/react-auth/solana` `signMessage` |

Message signing is **gasless and non-transactional**:

- No blockchain transaction
- No gas
- No token approvals
- No spending permissions

Signature verification reuses the PR4 adapters (`verifyEvmPersonalSign` /
`verifySolanaSignMessage`) through `createWalletVerificationService`. There is
no second signature-verification implementation.

Challenges are short-lived (default 10 minutes) and single-use. Completion is
atomic (consume challenge + mark verified together). Wallet role is preserved.

## Verification and inventory sync are separate outcomes

`POST /api/wallets/verification/verify` only completes ownership verification.

`POST /api/wallets/inventory/sync` runs `WalletInventoryService.syncVerifiedWalletInventory`
for that single verified wallet.

If sync fails:

- the wallet stays `verified`
- previous inventory is preserved (no stale cleanup)
- the UI shows a retryable **Sync Failed** state with **Retry Sync**

Verified wallets may be retried for sync at any time without signing again.

## Collector Identity refresh

After successful verification and after successful sync, the client calls
`refreshIdentity()` which re-fetches `GET /api/collector-identity/me` through
the existing typed client. No full browser reload. No duplicated profile
mapping logic.

Real metrics that begin appearing:

- verified wallet count and wallet list
- collection count / unique token count
- inventory status and latest successful sync
- collection summaries where supported

## What this PR does not do

- Collector Score / Collection Score
- Badges or achievements awarding
- Pricing, rarity, marketplace enrichment
- Recommendations
- Background job systems
- PR10 work

## Identity model (Privy → internal UUID)

Collect Digital does **not** store Privy DIDs as foreign keys.

```
Privy authenticated user (JWT sub, e.g. did:privy:…)
        ↓
profiles identity mapping  (privy_user_id → id uuid)
        ↓
internal Collect Digital profile UUID
        ↓
wallets, challenges, inventory, future product data
```

- `requireAuthenticatedProfile` verifies the Privy Bearer token, then calls
  `resolveOrCreateProfileForPrivyUser` once.
- First login inserts a `profiles` row; concurrent first-logins converge via
  `unique (privy_user_id)`.
- `AuthenticatedProfileContext.profileId` is always `profiles.id` (UUID).
- Client-supplied profile IDs are never trusted.

Supabase Auth (`auth.users`) is not used. Supabase is persistence only.

## Canonical signing (exact server message)

1. Client calls `POST /api/wallets/verification/challenge`.
2. Server builds the message with `buildWalletOwnershipChallengeMessage` from
   persisted challenge + wallet rows and returns `{ message, challengeId, ... }`.
3. Client displays that exact `message` string and passes **the same string** to
   Privy signing (`wallet.sign(message)` / Solana `signMessage`).
4. Client submits `{ challengeId, walletId, signature }` — never a client-built
   message body.
5. Server reconstructs the canonical message again from DB rows and verifies the
   signature against that reconstruction.

There is no client-side message reconstruction for verification, no alternate
formatting, and no arbitrary message text.

## Required Vercel environment variables

Wallet verification and Collector Identity require a Supabase admin client on
the **server**. Preview/Production deployments that omit these variables fail
with a logged infrastructure error and show a user-friendly unavailable state.

| Variable | Scope | Required | Notes |
|----------|-------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Server (+ public) | **Yes** | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | **Yes** | Service role key — never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Recommended | Reserved for future client reads |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Public | **Yes** | Privy login |

Add them in Vercel → Project Settings → Environment Variables for
**Production**, **Preview**, and **Development**.

Why the service role is required:

- Server routes must read/write `profile_wallets`, verification challenges, and
  inventory under privileged access after verifying the Privy JWT.
- The service role must never ship to the browser. Client code only receives
  typed API responses.

Root cause of `Supabase admin client unavailable for ProfileWalletRepository`
on Preview: **deployment configuration** — missing
`SUPABASE_SERVICE_ROLE_KEY` and/or `NEXT_PUBLIC_SUPABASE_URL`. This is not a
dependency-injection bug and must not be papered over with insecure fallbacks.

## Security guarantees

- `profileId` always comes from trusted server auth
- Connected wallet address is normalized before use
- Registration ≠ verification
- Signature message is canonical and server-generated
- Challenges are short-lived and single-use
- Verification completion remains atomic
- No arbitrary message verification
- No transaction or approval requests
- No secrets reach the client (`SUPABASE_SERVICE_ROLE_KEY` is server-only)
- Product tables enable RLS with no anon/authenticated policies; table and
  privileged RPC execute grants are revoked from those roles
- Wallet role is preserved
- Verified status is never inferred from login alone
- Only verified wallets may sync; sync validates wallet ownership server-side
- Domain errors are mapped to user-facing copy; repository names and stack
  traces are never leaked to clients (logged server-side only)

## API boundaries

Frontend may call typed clients only:

- `src/lib/wallet-verification-flow/client.ts`
- `src/lib/collector-identity/client.ts`

Frontend must not import repositories, database clients, verification services,
inventory services, or provider adapters.
