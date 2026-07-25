# Wallet Inventory Normalization (PR5)

This module ingests holdings from **verified** wallets and normalizes them into
Collect Digital's internal asset model. It is the inventory foundation only.

## Rules

- **Only verified wallets may sync.** Pending, revoked, and disconnected
  wallets are rejected with explicit domain errors.
- **Provider responses are normalized before storage.** EVM and Solana adapters
  convert upstream payloads into provider-independent inventory items; business
  logic never consumes provider-specific response models.
- **Inventory is not analysis.** This module does not derive collector metrics,
  behavior signals, or quality judgments.
- **Inventory is not scoring.** No collector scores, rarity, floor prices,
  valuations, or marketplace enrichment are calculated here.

## What is stored

Normalized holdings contain only fields needed for future analysis:

`walletId`, `chainNamespace`, `contractAddress`, `tokenId`, `assetStandard`,
`quantity`, `collectionId` (nullable), `ownerAddress`, `acquiredAt` (nullable),
`lastSeenAt`, `sourceProvider`.

Sync rows record `syncStartedAt`, `syncCompletedAt`, `syncStatus`, `provider`,
and nullable `errorMessage`.

## Future boundary

Future collector intelligence (PR6+) will consume these normalized holdings.
This PR does not begin that analysis engine.
