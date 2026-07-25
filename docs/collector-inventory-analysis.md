# Collector Inventory Analysis (PR6)

PR6 is the first analysis layer on top of **normalized wallet inventory** from
PR5. It summarizes verified-wallet holdings and groups them into collections.

## Boundaries

- **Consumes normalized inventory only.** Analysis reads verified wallets and
  persisted `NormalizedHolding` rows through the inventory repository.
- **Never modifies inventory.** No upserts, replacements, sync starts, provider
  fetches, score persistence, or derived-summary persistence occur here.
- **Provider-independent.** Analysis models never expose Alchemy, Helius, or
  other provider response objects — only Collect Digital domain types.
- **Not scoring.** Collection Scores and Collector Scores begin in a later PR.
  This module does not calculate rarity, floor price, valuation, marketplace
  enrichment, or recommendations.

## Wallet eligibility

Analysis includes only wallets whose **current registry status** is:

- `verificationStatus === "verified"`
- `disconnectedAt == null`

Pending, revoked, and disconnected wallets are excluded even when holdings from
an earlier sync still exist in the database. Holdings alone never imply
eligibility.

## Count field definitions

### Collector summary (`CollectorInventorySummary`)

| Field | Definition |
|-------|------------|
| `verifiedWalletCount` | Number of currently verified + connected wallets included |
| `totalCollections` | Number of unique collection grouping identities |
| `uniqueTokenCount` | Number of unique canonical asset identities across the collector |
| `totalQuantity` | Summed ownership quantity (decimal integer string), including ERC1155 |

There is **no** `totalNFTs` or `totalAssets` field. Those names overlapped and
are intentionally avoided.

### Collection aggregation (`CollectionAggregation`)

| Field | Definition |
|-------|------------|
| `ownershipRecordCount` | Count of included holding rows (wallet × token). Same token in two wallets contributes 2 |
| `uniqueTokenCount` | Distinct canonical asset identities in the collection (deduped across wallets) |
| `totalQuantity` | Summed quantities for holdings in the collection |

## Canonical asset identity

```
${chainNamespace}:${contractAddress}:${tokenId}
```

- Includes chain namespace — identical token IDs on different chains stay distinct
- Excludes wallet ID — used for cross-wallet dedupe
- Contract/mint addresses are the normalized inventory values from PR5

## Cross-wallet deduplication

| Case | Behavior |
|------|----------|
| Same ERC721 in multiple included wallets | `uniqueTokenCount` += 1; provenance retained on each holding; listed under `duplicateAssets` |
| Same ERC1155 in multiple wallets | one unique token identity; quantities summed; per-wallet quantities preserved on `duplicateAssets.walletQuantities` |
| Different chains | never deduped against each other |

## Solana collection identity

Determined in PR5 normalization (not invented in PR6):

1. Solana adapter extracts the Metaplex **verified collection key/address** when
   present on the upstream-shaped payload and places it on
   `ProviderInventoryItem.collectionId`.
2. Normalization sets
   `collectionId = solana:${verifiedCollectionAddress}` when that value exists.
3. When no verified collection key is available, normalization falls back to
   `collectionId = solana:${mint}` (per-mint singleton).

**Limitation:** Solana NFTs without a verified collection key each appear as
their own collection until a verified collection address is supplied by the
adapter. Marketplace/catalog-only identifiers are never used.

## Missing collection identity

Holdings with `collectionId == null`:

- still count toward `uniqueTokenCount` and `totalQuantity`
- do **not** collapse into a shared `"unknown"` collection
- use an asset-specific fallback grouping key `asset:${assetIdentityKey}` when
  collection aggregation requires a grouping identity

## Inventory freshness

| Field | Semantics |
|-------|-----------|
| `lastInventorySync` | **Newest successful** sync timestamp across included wallets |
| `walletFreshness[]` | Per-wallet `lastSuccessfulSyncAt` for the same eligible wallets |

Failed, running, and idle syncs never contribute. When the latest sync row is a
failure, the prior successful sync (if any) is still used via
`findLatestSuccessfulSync`.

## Determinism

For a given inventory + wallet registry state, analysis output ordering is
stable:

- verified wallets sorted by `walletId`
- holdings sorted by wallet → chain → contract → tokenId
- collections / collectionDistribution sorted by `collectionId`
- chainDistribution keys emitted in fixed order (`eip155`, then `solana`)
- duplicate assets sorted by chain → contract → tokenId

Output does not depend on DB row order, provider order, or insertion order.

## Repository additions (read-only)

- `listHoldingsByWallets(walletIds)`
- `listHoldingsByCollection(collectionId)`
- `findLatestSuccessfulSync(walletId)`

No analysis path writes holdings, triggers sync, calls providers, or persists
scores/derived summaries. Normalized inventory remains the source of truth.

## Future boundary

Scoring and collector intelligence that build on these aggregates belong in a
later PR. This module stops at inventory analysis.
