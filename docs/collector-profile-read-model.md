# Unified Collector Profile Read Model (PR7)

PR7 introduces the first **unified collector profile read model**. It assembles
existing Collect Digital domain data into a single profile-ready object for
future UI and scoring consumers.

## Boundaries

- **`CollectorProfileService` is read-only.** It never writes wallets, holdings,
  sync rows, analysis snapshots, or scores.
- **Composition only.** The service consumes:
  - verified wallet registry (`ProfileWalletRepository`)
  - normalized wallet inventory (`WalletInventoryRepository`)
  - collector inventory analysis (`CollectorAnalysisService`)
- **No blockchain calls occur in PR7.** No RPC, no provider adapters, no wallet
  synchronization.
- **No scoring or marketplace enrichment occurs in PR7.** No Collection Score,
  Collector Score, pricing, rarity, or recommendations.
- **Future UI should consume this read model** instead of querying the wallet
  registry, inventory repository, and analysis service separately.

## Profile shape

| Section | Fields |
|---------|--------|
| Identity | `profileId`, `displayName?`, `avatarUrl?`, `bio?` |
| Wallet summary | `verifiedWallets`, `walletCount`, `chainDistribution`, `latestSuccessfulSync` |
| Inventory summary | `totalCollections`, `uniqueTokenCount`, `totalQuantity`, `duplicateAssets` |
| Collection summaries | `collectionId`, `chainNamespace`, `contractAddress`, `uniqueTokenCount`, `totalQuantity`, `walletsContainingCollection` |

Identity enrichment fields are nullable in PR7. The profile layer does not
invent display names or avatars from wallet addresses.

`chainDistribution` and collection aggregates are taken from PR6 analysis
(unique-token semantics). Analysis logic is not duplicated here.

## Error handling

| Error | When |
|-------|------|
| `profile_not_found` | No wallet-registry rows for the profile id |
| `no_verified_wallets` | Profile exists but has no verified + connected wallets |
| `inventory_unavailable` | Inventory / analysis reads fail |

Empty inventory for a verified collector is a valid profile (zeroed summaries),
not an error. Profiles are never fabricated for unknown ids.

## Read performance

Profile composition prefers batched repository reads:

- `listWalletsByProfile`
- `listHoldingsByWallets` (inside analysis)
- `findLatestSuccessfulSyncs` (batched; avoids N+1 sync lookups)

## Out of scope

PR8 and later may add scoring, identity enrichment, and UI wiring. This PR stops
at the read-model composition layer.
