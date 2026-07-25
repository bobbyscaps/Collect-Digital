import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";
import {
  assetIdentityKey,
  parseQuantityAsNumber,
  sumQuantityStrings,
  type ChainDistribution,
  type CollectionAggregation,
  type CollectionDistributionEntry,
  type CollectorInventorySummary,
  type DuplicateAsset,
} from "@/lib/collector-analysis/domain";

interface CollectionBucket {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  holdings: NormalizedHolding[];
  tokenIds: Set<string>;
  walletIds: Set<string>;
}

interface AssetBucket {
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  tokenId: string;
  collectionId: string | null;
  walletIds: Set<string>;
  quantities: string[];
}

function parseCollectionId(
  collectionId: string
): { chainNamespace: WalletChainNamespace; contractAddress: string } | null {
  const separator = collectionId.indexOf(":");
  if (separator <= 0 || separator === collectionId.length - 1) return null;
  const chainNamespace = collectionId.slice(0, separator);
  const contractAddress = collectionId.slice(separator + 1);
  if (chainNamespace !== "eip155" && chainNamespace !== "solana") return null;
  return { chainNamespace, contractAddress };
}

/**
 * Groups normalized holdings into collection aggregations.
 * Holdings without a collectionId are skipped for collection grouping
 * (they still contribute to summary totals via asset identity).
 */
export function aggregateCollections(
  holdings: readonly NormalizedHolding[]
): readonly CollectionAggregation[] {
  const buckets = new Map<string, CollectionBucket>();

  for (const holding of holdings) {
    if (!holding.collectionId) continue;
    let bucket = buckets.get(holding.collectionId);
    if (!bucket) {
      const parsed = parseCollectionId(holding.collectionId);
      bucket = {
        collectionId: holding.collectionId,
        chainNamespace: parsed?.chainNamespace ?? holding.chainNamespace,
        contractAddress: parsed?.contractAddress ?? holding.contractAddress,
        holdings: [],
        tokenIds: new Set(),
        walletIds: new Set(),
      };
      buckets.set(holding.collectionId, bucket);
    }
    bucket.holdings.push(holding);
    bucket.tokenIds.add(holding.tokenId);
    bucket.walletIds.add(holding.walletId);
  }

  return Object.freeze(
    Array.from(buckets.values())
      .map((bucket) =>
        Object.freeze({
          collectionId: bucket.collectionId,
          chainNamespace: bucket.chainNamespace,
          contractAddress: bucket.contractAddress,
          totalAssetsOwned: bucket.holdings.length,
          uniqueTokenCount: bucket.tokenIds.size,
          totalQuantity: sumQuantityStrings(
            bucket.holdings.map((holding) => holding.quantity)
          ),
          walletsContainingCollection: Object.freeze(
            Array.from(bucket.walletIds).sort((a, b) => a.localeCompare(b))
          ),
        } satisfies CollectionAggregation)
      )
      .sort((a, b) => a.collectionId.localeCompare(b.collectionId))
  );
}

function buildAssetBuckets(
  holdings: readonly NormalizedHolding[]
): Map<string, AssetBucket> {
  const buckets = new Map<string, AssetBucket>();

  for (const holding of holdings) {
    const key = assetIdentityKey(holding);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        chainNamespace: holding.chainNamespace,
        contractAddress: holding.contractAddress,
        tokenId: holding.tokenId,
        collectionId: holding.collectionId,
        walletIds: new Set(),
        quantities: [],
      };
      buckets.set(key, bucket);
    }
    bucket.walletIds.add(holding.walletId);
    bucket.quantities.push(holding.quantity);
    if (bucket.collectionId == null && holding.collectionId != null) {
      bucket.collectionId = holding.collectionId;
    }
  }

  return buckets;
}

export function buildDuplicateAssets(
  holdings: readonly NormalizedHolding[]
): readonly DuplicateAsset[] {
  const buckets = buildAssetBuckets(holdings);
  const duplicates: DuplicateAsset[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.walletIds.size < 2) continue;
    duplicates.push(
      Object.freeze({
        chainNamespace: bucket.chainNamespace,
        contractAddress: bucket.contractAddress,
        tokenId: bucket.tokenId,
        collectionId: bucket.collectionId,
        walletIds: Object.freeze(
          Array.from(bucket.walletIds).sort((a, b) => a.localeCompare(b))
        ),
        totalQuantity: sumQuantityStrings(bucket.quantities),
      })
    );
  }

  return Object.freeze(
    duplicates.sort((a, b) => {
      const byContract = a.contractAddress.localeCompare(b.contractAddress);
      if (byContract !== 0) return byContract;
      return a.tokenId.localeCompare(b.tokenId);
    })
  );
}

export function buildChainDistribution(
  holdings: readonly NormalizedHolding[]
): ChainDistribution {
  const uniqueByChain = new Map<WalletChainNamespace, Set<string>>();

  for (const holding of holdings) {
    let set = uniqueByChain.get(holding.chainNamespace);
    if (!set) {
      set = new Set();
      uniqueByChain.set(holding.chainNamespace, set);
    }
    set.add(assetIdentityKey(holding));
  }

  const distribution: Partial<Record<WalletChainNamespace, number>> = {};
  for (const [namespace, tokens] of uniqueByChain) {
    distribution[namespace] = tokens.size;
  }
  return Object.freeze(distribution);
}

export function buildCollectorSummary(input: {
  verifiedWallets: readonly ProfileWallet[];
  holdings: readonly NormalizedHolding[];
  collections: readonly CollectionAggregation[];
  lastInventorySync: string | null;
}): CollectorInventorySummary {
  const assetBuckets = buildAssetBuckets(input.holdings);
  const totalNFTs = assetBuckets.size;
  const totalAssets = input.holdings.reduce(
    (sum, holding) => sum + parseQuantityAsNumber(holding.quantity),
    0
  );

  const collectionDistribution = Object.freeze(
    input.collections
      .map((collection) =>
        Object.freeze({
          collectionId: collection.collectionId,
          uniqueTokenCount: collection.uniqueTokenCount,
          totalQuantity: collection.totalQuantity,
          walletCount: collection.walletsContainingCollection.length,
        } satisfies CollectionDistributionEntry)
      )
      .sort((a, b) => {
        if (b.uniqueTokenCount !== a.uniqueTokenCount) {
          return b.uniqueTokenCount - a.uniqueTokenCount;
        }
        return a.collectionId.localeCompare(b.collectionId);
      })
  ) as readonly CollectionDistributionEntry[];

  return Object.freeze({
    verifiedWalletCount: input.verifiedWallets.length,
    totalCollections: input.collections.length,
    totalNFTs,
    totalAssets,
    chainDistribution: buildChainDistribution(input.holdings),
    collectionDistribution,
    duplicateAssets: buildDuplicateAssets(input.holdings),
    lastInventorySync: input.lastInventorySync,
  });
}

/**
 * Connected + verified wallets only. Pending, revoked, and disconnected
 * wallets are excluded from collector inventory analysis.
 */
export function selectVerifiedConnectedWallets(
  wallets: readonly ProfileWallet[]
): readonly ProfileWallet[] {
  return Object.freeze(
    wallets.filter(
      (wallet) =>
        wallet.verificationStatus === "verified" && wallet.disconnectedAt == null
    )
  );
}

/**
 * Picks the most recent sync timestamp across wallet sync rows.
 * Prefers syncCompletedAt, falls back to syncStartedAt.
 */
export function resolveLastInventorySync(
  timestamps: readonly (string | null | undefined)[]
): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const value of timestamps) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  }

  return latest;
}
