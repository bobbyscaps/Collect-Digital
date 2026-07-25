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

## Idempotency

Running sync twice with identical provider payloads must yield identical
database state:

- Unique key `(walletId, chainNamespace, contractAddress, tokenId)` prevents duplicates
- Unchanged holdings are skipped entirely (no `updatedAt` / `lastSeenAt` churn)
- Address normalization (lowercase EVM, canonical Solana base58) prevents casing duplicates

## Partial sync protection

Provider adapters must return a complete inventory or throw. On any failure:

- existing holdings remain valid
- stale cleanup does **not** run
- sync status becomes `failure`
- previous successful inventory is preserved

## Atomic inventory replacement

Successful sync sequence:

1. begin sync
2. fetch provider inventory (complete)
3. normalize
4. `replaceWalletInventory` (upsert changed + remove stale, one logical op)
5. mark sync completed (`success`, `durationMs`)

Postgres uses `replace_wallet_inventory` RPC for transactional replacement.

## NFT standards

Supported known values:

- EVM: `erc721`, `erc1155`
- Solana: `solana_nft` (standard), `solana_pnft` (programmable)
- `unknown` for unrecognized standards (never rejected)

`asset_standard` is free-form text in Postgres so future chains need no schema change.

## Collection identity

`collectionId` is derived as `${chainNamespace}:${contractAddress}` only.
Provider catalog IDs/slugs are never persisted. Collection enrichment is future work.

## Sync metadata

Each sync row records: `syncStartedAt`, `syncCompletedAt`, `durationMs`,
`provider`, `syncStatus` (`success` / `failure`), and nullable `errorMessage`.
Future background workers should reuse this information.

## Future boundary

Collector inventory analysis (PR6) consumes these normalized holdings in a
read-only fashion. Inventory sync never performs analysis or scoring.
