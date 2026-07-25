# Profile Wallet Registry (PR3)

This module introduces the contracts and persistence model for associating
multiple wallets with one Collect Digital profile.

## Behavioral notes

- A `login` wallet is the wallet used for authentication entry, but it does not
  automatically remain the `primary` wallet forever.
- Only wallets in `verified` status are intended to contribute to future
  collector analysis flows.
- `disconnected` or `revoked` wallets are retained for auditability, but must
  be excluded from future scoring contribution logic.

## Scope boundary

This PR adds domain contracts, normalization, repository contracts, and
persistence schema for linked wallets.

Signature ownership verification lives in PR4
(`docs/wallet-ownership-verification.md`). This registry PR does **not** ingest
holdings, query providers for collector metrics, or integrate scoring.
