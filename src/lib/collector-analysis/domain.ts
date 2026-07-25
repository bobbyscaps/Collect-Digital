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
 * Grouped by stable `collectionId` (`${chainNamespace}:${contractAddress}`).
 *
 * Does not include rarity, floor price, or valuation.
 */
export interface CollectionAggregation {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  /** Number of ownership records (holding rows) for this collection. */
  totalAssetsOwned: number;
  /** Distinct token IDs within this collection (deduped across wallets). */
  uniqueTokenCount: number;
  /** Sum of holding quantities (supports ERC1155). Decimal integer string. */
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
  /** Sum of quantities across wallets for this asset identity. */
  totalQuantity: string;
}

/**
 * Per-chain counts for a collector. Values are unique token counts
 * (asset identity deduped across wallets on that chain).
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
 * Internal collector inventory summary.
 * Not a UI model and not a score.
 */
export interface CollectorInventorySummary {
  verifiedWalletCount: number;
  totalCollections: number;
  /** Distinct assets (chain + contract + tokenId), deduped across wallets. */
  totalNFTs: number;
  /** Sum of all holding quantities (ERC1155-aware; multi-wallet quantities add). */
  totalAssets: number;
  chainDistribution: ChainDistribution;
  collectionDistribution: readonly CollectionDistributionEntry[];
  duplicateAssets: readonly DuplicateAsset[];
  /** Most recent inventory sync timestamp across verified wallets, if any. */
  lastInventorySync: string | null;
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
   * Normalized holdings included in the analysis.
   * Each row retains wallet ownership provenance (`walletId`, `ownerAddress`).
   */
  holdings: readonly NormalizedHolding[];
}

/**
 * Cross-wallet asset identity (excludes walletId to detect duplicates).
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

export function parseQuantityAsNumber(quantity: string): number {
  const trimmed = quantity.trim();
  if (!/^\d+$/.test(trimmed)) return 0;
  const asNumber = Number(trimmed);
  return Number.isSafeInteger(asNumber) ? asNumber : Number.MAX_SAFE_INTEGER;
}
