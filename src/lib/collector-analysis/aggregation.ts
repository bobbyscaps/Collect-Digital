import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";
import {
  assetIdentityKey,
  assetSpecificCollectionId,
  sumQuantityStrings,
  type ChainDistribution,
  type CollectionAggregation,
  type CollectionDistributionEntry,
  type CollectorInventorySummary,
  type DuplicateAsset,
  type WalletInventoryFreshness,
} from "@/lib/collector-analysis/domain";

const CHAIN_NAMESPACE_ORDER: readonly WalletChainNamespace[] = [
  "eip155",
  "solana",
];

interface CollectionBucket {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  holdings: NormalizedHolding[];
  assetIdentities: Set<string>;
  walletIds: Set<string>;
}

interface AssetBucket {
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  tokenId: string;
  collectionId: string | null;
  walletQuantities: Map<string, string[]>;
}

function parseCollectionId(
  collectionId: string
): { chainNamespace: WalletChainNamespace; contractAddress: string } | null {
  if (collectionId.startsWith("asset:")) {
    const rest = collectionId.slice("asset:".length);
    const parts = rest.split(":");
    if (parts.length < 3) return null;
    const chainNamespace = parts[0];
    const tokenId = parts[parts.length - 1];
    const contractAddress = parts.slice(1, -1).join(":");
    if (chainNamespace !== "eip155" && chainNamespace !== "solana") return null;
    if (!contractAddress || !tokenId) return null;
    return { chainNamespace, contractAddress };
  }

  const separator = collectionId.indexOf(":");
  if (separator <= 0 || separator === collectionId.length - 1) return null;
  const chainNamespace = collectionId.slice(0, separator);
  const contractAddress = collectionId.slice(separator + 1);
  if (chainNamespace !== "eip155" && chainNamespace !== "solana") return null;
  return { chainNamespace, contractAddress };
}

/**
 * Resolves the collection grouping key for a holding.
 * Missing collectionId uses an asset-specific fallback — never a shared unknown.
 */
export function resolveGroupingCollectionId(
  holding: NormalizedHolding
): string {
  if (holding.collectionId && holding.collectionId.trim()) {
    return holding.collectionId;
  }
  return assetSpecificCollectionId(holding);
}

/**
 * Groups normalized holdings into collection aggregations.
 * Holdings without collectionId still group via asset-specific fallbacks and
 * always contribute to unique token / quantity totals at the summary layer.
 */
export function aggregateCollections(
  holdings: readonly NormalizedHolding[]
): readonly CollectionAggregation[] {
  const buckets = new Map<string, CollectionBucket>();

  for (const holding of holdings) {
    const collectionId = resolveGroupingCollectionId(holding);
    let bucket = buckets.get(collectionId);
    if (!bucket) {
      const parsed = parseCollectionId(collectionId);
      bucket = {
        collectionId,
        chainNamespace: parsed?.chainNamespace ?? holding.chainNamespace,
        contractAddress: parsed?.contractAddress ?? holding.contractAddress,
        holdings: [],
        assetIdentities: new Set(),
        walletIds: new Set(),
      };
      buckets.set(collectionId, bucket);
    }
    bucket.holdings.push(holding);
    bucket.assetIdentities.add(assetIdentityKey(holding));
    bucket.walletIds.add(holding.walletId);
  }

  return Object.freeze(
    Array.from(buckets.values())
      .map((bucket) =>
        Object.freeze({
          collectionId: bucket.collectionId,
          chainNamespace: bucket.chainNamespace,
          contractAddress: bucket.contractAddress,
          ownershipRecordCount: bucket.holdings.length,
          uniqueTokenCount: bucket.assetIdentities.size,
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
        walletQuantities: new Map(),
      };
      buckets.set(key, bucket);
    }
    const existing = bucket.walletQuantities.get(holding.walletId) ?? [];
    existing.push(holding.quantity);
    bucket.walletQuantities.set(holding.walletId, existing);
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
    if (bucket.walletQuantities.size < 2) continue;
    const walletQuantities = Object.freeze(
      Array.from(bucket.walletQuantities.entries())
        .map(([walletId, quantities]) =>
          Object.freeze({
            walletId,
            quantity: sumQuantityStrings(quantities),
          })
        )
        .sort((a, b) => a.walletId.localeCompare(b.walletId))
    );
    duplicates.push(
      Object.freeze({
        chainNamespace: bucket.chainNamespace,
        contractAddress: bucket.contractAddress,
        tokenId: bucket.tokenId,
        collectionId: bucket.collectionId,
        walletIds: Object.freeze(
          walletQuantities.map((entry) => entry.walletId)
        ),
        totalQuantity: sumQuantityStrings(
          walletQuantities.map((entry) => entry.quantity)
        ),
        walletQuantities,
      })
    );
  }

  return Object.freeze(
    duplicates.sort((a, b) => {
      const byChain = a.chainNamespace.localeCompare(b.chainNamespace);
      if (byChain !== 0) return byChain;
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
  for (const namespace of CHAIN_NAMESPACE_ORDER) {
    const tokens = uniqueByChain.get(namespace);
    if (tokens) {
      distribution[namespace] = tokens.size;
    }
  }
  return Object.freeze(distribution);
}

export function buildCollectorSummary(input: {
  verifiedWallets: readonly ProfileWallet[];
  holdings: readonly NormalizedHolding[];
  collections: readonly CollectionAggregation[];
  lastInventorySync: string | null;
  walletFreshness: readonly WalletInventoryFreshness[];
}): CollectorInventorySummary {
  const assetBuckets = buildAssetBuckets(input.holdings);
  const allQuantities = input.holdings.map((holding) => holding.quantity);

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
      .sort((a, b) => a.collectionId.localeCompare(b.collectionId))
  ) as readonly CollectionDistributionEntry[];

  const walletFreshness = Object.freeze(
    [...input.walletFreshness].sort((a, b) =>
      a.walletId.localeCompare(b.walletId)
    )
  );

  return Object.freeze({
    verifiedWalletCount: input.verifiedWallets.length,
    totalCollections: input.collections.length,
    uniqueTokenCount: assetBuckets.size,
    totalQuantity: sumQuantityStrings(allQuantities),
    chainDistribution: buildChainDistribution(input.holdings),
    collectionDistribution,
    duplicateAssets: buildDuplicateAssets(input.holdings),
    lastInventorySync: input.lastInventorySync,
    walletFreshness,
  });
}

/**
 * Connected + verified wallets only. Eligibility is evaluated from the
 * current registry status — persisted holdings alone never imply inclusion.
 * Pending, revoked, and disconnected wallets are excluded.
 */
export function selectVerifiedConnectedWallets(
  wallets: readonly ProfileWallet[]
): readonly ProfileWallet[] {
  return Object.freeze(
    wallets
      .filter(
        (wallet) =>
          wallet.verificationStatus === "verified" &&
          wallet.disconnectedAt == null
      )
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

/**
 * Newest successful sync timestamp among the provided values.
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

export function sortHoldingsDeterministically(
  holdings: readonly NormalizedHolding[]
): readonly NormalizedHolding[] {
  return Object.freeze(
    [...holdings].sort((a, b) => {
      const byWallet = a.walletId.localeCompare(b.walletId);
      if (byWallet !== 0) return byWallet;
      const byChain = a.chainNamespace.localeCompare(b.chainNamespace);
      if (byChain !== 0) return byChain;
      const byContract = a.contractAddress.localeCompare(b.contractAddress);
      if (byContract !== 0) return byContract;
      return a.tokenId.localeCompare(b.tokenId);
    })
  );
}
