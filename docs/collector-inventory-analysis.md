# Collector Inventory Analysis (PR6)

PR6 is the first analysis layer on top of **normalized wallet inventory** from
PR5. It summarizes verified-wallet holdings and groups them into collections.

## Boundaries

- **Consumes normalized inventory only.** Analysis reads verified wallets and
  persisted `NormalizedHolding` rows through the inventory repository.
- **Never modifies inventory.** No upserts, replacements, sync starts, or
  provider fetches occur in this module.
- **Provider-independent.** Analysis models never expose Alchemy, Helius, or
  other provider response objects — only Collect Digital domain types.
- **Not scoring.** Collection Scores and Collector Scores begin in a later PR.
  This module does not calculate rarity, floor price, valuation, marketplace
  enrichment, or recommendations.

## Inputs

| Input | Source |
|-------|--------|
| Verified, connected wallets | `ProfileWalletRepository.listWalletsByProfile` |
| Normalized holdings | `WalletInventoryRepository.listHoldingsByWallets` / `listHoldingsByWallet` |
| Collection identity | `NormalizedHolding.collectionId` (`${chainNamespace}:${contractAddress}`) |
| Latest inventory sync | `WalletInventoryRepository.findLatestSync` |

Pending, revoked, and disconnected wallets are excluded.

## Outputs

### Collection aggregation

For each stable collection identity:

- `collectionId`, `chainNamespace`, `contractAddress`
- `totalAssetsOwned` — ownership records (holding rows)
- `uniqueTokenCount` — distinct token IDs (deduped across wallets)
- `totalQuantity` — sum of quantities (ERC1155-aware)
- `walletsContainingCollection` — verified wallet IDs

### Internal collector summary

`CollectorInventorySummary` (internal, no UI):

- `verifiedWalletCount`, `totalCollections`, `totalNFTs`, `totalAssets`
- `chainDistribution`, `collectionDistribution`
- `duplicateAssets` — same asset identity in multiple wallets
- `lastInventorySync`

## Multi-wallet rules

- Unique NFT counts dedupe by `chainNamespace + contractAddress + tokenId`
- Ownership provenance is preserved on each holding (`walletId`, `ownerAddress`)
- The same asset in multiple wallets is listed under `duplicateAssets`
- ERC1155 quantities sum into `totalQuantity` / `totalAssets`

## Repository additions (read-only)

PR6 adds inventory repository read methods only:

- `listHoldingsByWallets(walletIds)`
- `listHoldingsByCollection(collectionId)`

Existing `listHoldingsByWallet` and `findLatestSync` remain the other read paths.
No new write methods.

## Future boundary

Scoring and collector intelligence that build on these aggregates belong in a
later PR. This module stops at inventory analysis.
