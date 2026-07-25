import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";

/**
 * PR6 collector inventory analysis models.
 *
 * Provider-independent and Collect Digital domain only.
 * Never expose Alchemy/Helius/provider response objects.
 * Analysis never modifies inventory and does not calculate scores.
 */

/**
 * Aggregated view of one collection across a collector's verified wallets.
 *
 * Grouping key is the holding's stable `collectionId`, or an asset-specific
 * fallback when that value is missing (never a shared "unknown" bucket).
 *
 * Does not include rarity, floor price, or valuation.
 */
export interface CollectionAggregation {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  /**
   * EVM contract, Solana verified collection address, or mint/contract used
   * for the grouping key. For asset-specific fallbacks this is the holding's
   * contract/mint address (not a synthetic shared unknown address).
   */
  contractAddress: string;
  /**
   * Count of included ownership records (holding rows) for this collection.
   * Same token in two wallets contributes 2. Distinct from uniqueTokenCount
   * and totalQuantity.
   */
  ownershipRecordCount: number;
  /**
   * Distinct canonical asset identities within this collection
   * (`chainNamespace + contractAddress + tokenId`), deduped across wallets.
   */
  uniqueTokenCount: number;
  /** Summed ownership quantity across included holdings (ERC1155-aware). */
  totalQuantity: string;
  /** Verified wallet IDs that hold at least one asset from this collection. */
  walletsContainingCollection: readonly string[];
}

/**
 * Asset identity that appears in more than one verified wallet.
 * Provenance lists every wallet that holds the asset.
 */
export interface DuplicateAsset {
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  tokenId: string;
  collectionId: string | null;
  walletIds: readonly string[];
  /** Wallet-level quantities preserved as a sum across those wallets. */
  totalQuantity: string;
  /** Per-wallet quantities for provenance-preserving ERC1155 merges. */
  walletQuantities: readonly {
    walletId: string;
    quantity: string;
  }[];
}

/**
 * Per-chain unique token counts (canonical asset identity deduped on-chain).
 * Emitted with deterministic key order: eip155, then solana (when present).
 */
export type ChainDistribution = Readonly<
  Partial<Record<WalletChainNamespace, number>>
>;

/**
 * Per-collection distribution entry for the internal collector summary.
 */
export interface CollectionDistributionEntry {
  collectionId: string;
  uniqueTokenCount: number;
  totalQuantity: string;
  walletCount: number;
}

/**
 * Per-wallet inventory freshness for stale-wallet detection.
 * Only successful syncs contribute timestamps.
 */
export interface WalletInventoryFreshness {
  walletId: string;
  lastSuccessfulSyncAt: string | null;
}

/**
 * Internal collector inventory summary.
 * Not a UI model and not a score.
 *
 * Count field definitions (do not reinterpret):
 * - verifiedWalletCount: currently verified + connected wallets included
 * - totalCollections: unique collection grouping identities
 * - uniqueTokenCount: unique canonical asset identities across the collector
 * - totalQuantity: summed ownership quantity (string), including ERC1155
 *
 * There is no separate totalNFTs / totalAssets field — those names overlapped
 * and are intentionally avoided.
 */
export interface CollectorInventorySummary {
  verifiedWalletCount: number;
  totalCollections: number;
  uniqueTokenCount: number;
  totalQuantity: string;
  chainDistribution: ChainDistribution;
  collectionDistribution: readonly CollectionDistributionEntry[];
  duplicateAssets: readonly DuplicateAsset[];
  /**
   * Newest successful inventory sync timestamp across included wallets.
   * Failed/running syncs never contribute. Null when no wallet has succeeded.
   */
  lastInventorySync: string | null;
  /**
   * Per-wallet successful sync timestamps (same eligibility as analysis).
   * Lets callers spot a stale verified wallet without background jobs/UI.
   */
  walletFreshness: readonly WalletInventoryFreshness[];
}

/**
 * Wallet provenance retained in analysis output (no provider payloads).
 */
export interface AnalyzedWalletRef {
  walletId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  normalizedAddress: string;
}

/**
 * Full read-only analysis result for a collector profile.
 */
export interface CollectorInventoryAnalysis {
  profileId: string;
  verifiedWallets: readonly AnalyzedWalletRef[];
  summary: CollectorInventorySummary;
  collections: readonly CollectionAggregation[];
  /**
   * Normalized holdings included in the analysis (verified wallets only).
   * Each row retains wallet ownership provenance (`walletId`, `ownerAddress`).
   * Sorted deterministically; never includes revoked/disconnected/pending wallets.
   */
  holdings: readonly NormalizedHolding[];
}

/**
 * Canonical cross-wallet asset identity.
 * Includes chain namespace so identical token IDs on different chains stay distinct.
 * Excludes walletId so the same asset across wallets can be deduped.
 */
export function assetIdentityKey(
  holding: Pick<
    NormalizedHolding,
    "chainNamespace" | "contractAddress" | "tokenId"
  >
): string {
  return [
    holding.chainNamespace,
    holding.contractAddress,
    holding.tokenId,
  ].join(":");
}

/**
 * Asset-specific collection grouping fallback when `collectionId` is missing.
 * Never collapses unrelated assets into a shared "unknown" collection.
 */
export function assetSpecificCollectionId(
  holding: Pick<
    NormalizedHolding,
    "chainNamespace" | "contractAddress" | "tokenId"
  >
): string {
  return `asset:${assetIdentityKey(holding)}`;
}

/**
 * Sum non-negative integer quantity strings. Invalid values are ignored.
 */
export function sumQuantityStrings(quantities: readonly string[]): string {
  let total = BigInt(0);
  for (const raw of quantities) {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    total += BigInt(trimmed);
  }
  return total.toString();
}
