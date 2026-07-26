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

## Security guarantees

- `profileId` always comes from trusted server auth
- Connected wallet address is normalized before use
- Registration ≠ verification
- Signature message is canonical and server-generated
- Challenges are short-lived and single-use
- Verification completion remains atomic
- No arbitrary message verification
- No transaction or approval requests
- No secrets reach the client
- Wallet role is preserved
- Verified status is never inferred from login alone
- Domain errors are mapped explicitly; stack traces are not leaked

## API boundaries

Frontend may call typed clients only:

- `src/lib/wallet-verification-flow/client.ts`
- `src/lib/collector-identity/client.ts`

Frontend must not import repositories, database clients, verification services,
inventory services, or provider adapters.
