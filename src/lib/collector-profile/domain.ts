import type {
  AnalyzedWalletRef,
  ChainDistribution,
  DuplicateAsset,
  WalletInventoryFreshness,
} from "@/lib/collector-analysis/domain";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * PR7 unified collector profile read model.
 *
 * Canonical backend contract for future frontend consumption.
 * Provider-independent Collect Digital domain only.
 * Assembled from verified wallet registry + normalized inventory analysis.
 * Never exposes Alchemy/Helius/provider response objects.
 * Never includes Collection Score, Collector Score, pricing, or rarity.
 *
 * Versioning: bump `schemaVersion` only for breaking renames/removals.
 * Additive optional fields (scores, badges, social, showcase, …) must not
 * require a breaking bump when introduced as optional/nullable.
 */

/** Current collector profile read-model schema version. */
export const COLLECTOR_PROFILE_SCHEMA_VERSION = 1 as const;

/**
 * Profile identity fields.
 * Always present keys with explicit nullability — not omitted optionals.
 * PR7 does not invent identity from wallets or inventory.
 */
export interface CollectorProfileIdentity {
  profileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

/**
 * Aggregate inventory freshness for the collector.
 *
 * - `ready`: every verified wallet has a successful sync
 * - `partial`: at least one wallet synced successfully and at least one has not
 * - `unsynced`: no verified wallet has a successful sync yet
 *
 * Partial/unsynced profiles still return available holdings data.
 * `inventory_unavailable` is reserved for repository/analysis read failures
 * where no usable inventory can be loaded at all.
 */
export type CollectorProfileInventoryStatus =
  | "ready"
  | "partial"
  | "unsynced";

/**
 * Wallet summary for the collector profile read model.
 *
 * `chainDistribution` is unique-token counts per chain namespace, taken from
 * CollectorAnalysisService (not recalculated here).
 */
export interface CollectorProfileWalletSummary {
  verifiedWallets: readonly AnalyzedWalletRef[];
  walletCount: number;
  chainDistribution: ChainDistribution;
  /** Newest successful inventory sync across verified wallets. */
  latestSuccessfulSync: string | null;
  /**
   * Per-wallet successful sync timestamps.
   * Wallets with `lastSuccessfulSyncAt === null` require synchronization.
   */
  walletFreshness: readonly WalletInventoryFreshness[];
}

/**
 * Inventory summary for the collector profile read model.
 * Assembled from PR6 analysis — no scores, pricing, or rarity.
 */
export interface CollectorProfileInventorySummary {
  inventoryStatus: CollectorProfileInventoryStatus;
  totalCollections: number;
  uniqueTokenCount: number;
  totalQuantity: string;
  duplicateAssets: readonly DuplicateAsset[];
}

/**
 * Per-collection summary exposed on the profile read model.
 * Assembled from PR6 CollectionAggregation (no ownershipRecordCount).
 */
export interface CollectorProfileCollectionSummary {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  uniqueTokenCount: number;
  totalQuantity: string;
  walletsContainingCollection: readonly string[];
}

/**
 * Profile-ready read model assembled by CollectorProfileService.
 *
 * Future additive extension points (do not implement in PR7):
 * Collector Score, Collection Scores, achievement badges, social reputation,
 * token-gated communities, followers, following, featured NFTs, showcase settings.
 * Those belong as optional/nullable fields in later schema versions.
 */
export interface CollectorProfile {
  schemaVersion: typeof COLLECTOR_PROFILE_SCHEMA_VERSION;
  identity: CollectorProfileIdentity;
  walletSummary: CollectorProfileWalletSummary;
  inventorySummary: CollectorProfileInventorySummary;
  collectionSummaries: readonly CollectorProfileCollectionSummary[];
}

export type CollectorProfileErrorCode =
  | "profile_not_found"
  | "no_verified_wallets"
  | "inventory_unavailable";

export class CollectorProfileError extends Error {
  readonly code: CollectorProfileErrorCode;

  constructor(code: CollectorProfileErrorCode, message: string) {
    super(message);
    this.name = "CollectorProfileError";
    this.code = code;
  }
}

export class CollectorProfileNotFoundError extends CollectorProfileError {
  constructor(profileId: string) {
    super(
      "profile_not_found",
      `Collector profile not found: ${profileId}`
    );
    this.name = "CollectorProfileNotFoundError";
  }
}

export class NoVerifiedWalletsError extends CollectorProfileError {
  constructor(profileId: string) {
    super(
      "no_verified_wallets",
      `Collector profile ${profileId} has no verified wallets`
    );
    this.name = "NoVerifiedWalletsError";
  }
}

/**
 * Thrown only when inventory/analysis reads fail such that no usable inventory
 * can be loaded. Never thrown for partial sync or never-synced wallets.
 */
export class InventoryUnavailableError extends CollectorProfileError {
  constructor(profileId: string, cause?: unknown) {
    super(
      "inventory_unavailable",
      `Inventory unavailable for collector profile: ${profileId}`
    );
    this.name = "InventoryUnavailableError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Derives inventoryStatus from analysis freshness rows.
 * Assembly helper only — does not recalculate inventory aggregates.
 */
export function resolveInventoryStatus(
  walletFreshness: readonly WalletInventoryFreshness[]
): CollectorProfileInventoryStatus {
  if (walletFreshness.length === 0) return "unsynced";
  let synced = 0;
  for (const entry of walletFreshness) {
    if (entry.lastSuccessfulSyncAt != null) synced += 1;
  }
  if (synced === 0) return "unsynced";
  if (synced === walletFreshness.length) return "ready";
  return "partial";
}
