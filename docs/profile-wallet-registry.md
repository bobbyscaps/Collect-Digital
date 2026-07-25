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

This PR does **not** add signature verification, holdings ingestion, provider
queries, or scoring integration. It only adds domain contracts, normalization,
repository contracts, and persistence schema.
