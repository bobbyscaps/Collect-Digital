# Wallet Ownership Verification (PR4)

This module proves that an authenticated Collect Digital profile controls a
linked wallet address. It is the verification foundation only.

## What verification proves

- The profile can produce a valid signature over a short-lived challenge for a
  specific wallet address and chain namespace (`eip155` or `solana`).
- On success the wallet is marked `verified` and `verifiedAt` is set.
- Wallet roles (`login`, `primary`, `connected`) are preserved unchanged.

## Security model

- **Trusted profileId**: service methods take `AuthenticatedProfileContext`
  constructed only from server-side auth. Optional client `claimedProfileId`
  values are compared and rejected on mismatch.
- **Canonical message**: the signed message is always built server-side from
  persisted challenge + wallet rows. Client message text is never trusted.
- **Atomic completion**: challenge consume + wallet verify commit together via
  Postgres RPC `complete_wallet_ownership_verification` (or the in-memory
  transactional helper in tests). Concurrent reuse of one challenge is rejected
  by a conditional `consumed_at IS NULL` update.
- **Nonce**: `crypto.randomBytes(32)` hex (256-bit), unique in the database.

## What verification does not do

- It does **not** ingest wallet holdings.
- It does **not** calculate collector metrics.
- It does **not** analyze NFTs or begin scoring/orchestration work.

## Collector analysis boundary

Only wallets in `verified` status are intended to participate in later
collector analysis flows. Unverified, disconnected, or revoked wallets remain
out of scope for that future work.
