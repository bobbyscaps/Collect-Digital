# Unified Collector Profile Read Model (PR7)

PR7 introduces the first **unified collector profile read model**. It assembles
existing Collect Digital domain data into a single profile-ready object — the
canonical backend contract for future frontend development.

## Boundaries

- **`CollectorProfileService` is read-only.** It never writes wallets, holdings,
  sync rows, analysis snapshots, or scores.
- **Assemble, do not analyze.** The service orchestrates:
  - verified wallet registry (`ProfileWalletRepository`)
  - normalized wallet inventory (`WalletInventoryRepository`, via analysis)
  - collector inventory analysis (`CollectorAnalysisService`)
- Counts, chain distribution, duplicate assets, and collection aggregates come
  **only** from `CollectorAnalysisService`. The profile layer maps those fields;
  it does not recalculate them.
- **No blockchain calls occur in PR7.** No RPC, no provider adapters, no wallet
  synchronization.
- **No scoring or marketplace enrichment occurs in PR7.** No Collection Score,
  Collector Score, pricing, rarity, or recommendations.
- **Future UI should consume this read model** instead of querying the wallet
  registry, inventory repository, and analysis service separately.

## Schema versioning

`CollectorProfile.schemaVersion` is currently `1`.

- Bump only for breaking renames/removals.
- Additive optional/nullable fields (scores, badges, social, communities,
  followers/following, featured NFTs, showcase settings) must not require a
  breaking bump when introduced later.

## Profile shape

| Section | Fields |
|---------|--------|
| Root | `schemaVersion` |
| Identity | `profileId`, `displayName` (`string \| null`), `avatarUrl` (`string \| null`), `bio` (`string \| null`) |
| Wallet summary | `verifiedWallets`, `walletCount`, `chainDistribution`, `latestSuccessfulSync`, `walletFreshness[]` |
| Inventory summary | `inventoryStatus`, `totalCollections`, `uniqueTokenCount`, `totalQuantity`, `duplicateAssets` |
| Collection summaries | `collectionId`, `chainNamespace`, `contractAddress`, `uniqueTokenCount`, `totalQuantity`, `walletsContainingCollection` |

Identity keys are **always present** with explicit nullability. PR7 does not
invent display names or avatars from wallet addresses.

`chainDistribution` and collection aggregates are taken from PR6 analysis
(unique-token semantics). Property names avoid score-era terminology so scoring
can be added later without renames.

## Inventory freshness

| Field | Meaning |
|-------|---------|
| `latestSuccessfulSync` | Newest successful sync timestamp across verified wallets |
| `walletFreshness[]` | Per-wallet `lastSuccessfulSyncAt` (null ⇒ wallet needs sync) |
| `inventoryStatus` | `ready` \| `partial` \| `unsynced` |

No background jobs are introduced. The frontend can decide whether inventory is
current without additional service calls.

## Partial inventory behavior

If one verified wallet has current inventory and another has never synced:

1. The profile **returns available data** from synced wallets.
2. `walletFreshness` exposes which wallets still require synchronization.
3. `inventoryStatus` is `partial`.
4. The entire profile **does not fail**.

`inventory_unavailable` is reserved for repository/analysis read failures where
**no usable inventory** can be loaded at all. Empty holdings and never-synced
wallets are valid profile states (`unsynced` / zeroed summaries), not errors.

## Deterministic ordering

Independent of repository, provider, or insertion order:

| Surface | Order |
|---------|--------|
| `verifiedWallets` | `walletId` ascending (from analysis) |
| `collectionSummaries` | `collectionId` ascending (from analysis) |
| `chainDistribution` keys | fixed namespace order: `eip155`, then `solana` (when present) |
| `walletFreshness` | `walletId` ascending (from analysis) |
| `duplicateAssets` | chain → contract → tokenId (from analysis) |

## Repository call sequence

Profile composition uses a **bounded** number of repository operations — not
linear in wallet count:

1. `profileWallets.listWalletsByProfile(profileId)` — existence + eligibility
2. Inside `analysis.analyzeCollectorInventory(profileId)`:
   1. `profileWallets.listWalletsByProfile(profileId)` — verified set for analysis
   2. `inventory.listHoldingsByWallets(walletIds)` — **one** batched holdings read
   3. `inventory.findLatestSuccessfulSyncs(walletIds)` — **one** batched sync read

Total: **4** repository calls (2 registry list + 2 batched inventory reads),
regardless of how many verified wallets the collector has.

## Future extension points (additive only)

Later PRs may add optional/nullable fields without redesigning this model:

- Collector Score
- Collection Scores
- Achievement badges
- Social reputation
- Token-gated communities
- Followers / following
- Featured NFTs
- Showcase settings

Do not implement these in PR7.

## Error handling

| Error | When |
|-------|------|
| `profile_not_found` | No wallet-registry rows for the profile id |
| `no_verified_wallets` | Profile exists but has no verified + connected wallets |
| `inventory_unavailable` | Inventory/analysis reads fail — no usable inventory |

## Out of scope

PR8 wires this read model into the authenticated Collector Identity API and UI.
Scoring, marketplace enrichment, and NFT gallery remain out of scope for PR7
and PR8. This PR stops at the read-model composition layer.
