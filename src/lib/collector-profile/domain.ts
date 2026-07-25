import type {
  AnalyzedWalletRef,
  ChainDistribution,
  DuplicateAsset,
} from "@/lib/collector-analysis/domain";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * PR7 unified collector profile read model.
 *
 * Provider-independent Collect Digital domain only.
 * Assembled from verified wallet registry + normalized inventory analysis.
 * Never exposes Alchemy/Helius/provider response objects.
 * Never includes Collection Score, Collector Score, pricing, or rarity.
 */

/**
 * Profile identity fields.
 * displayName / avatarUrl / bio are nullable until a dedicated identity store
 * is composed in; PR7 does not invent identity from wallets or inventory.
 */
export interface CollectorProfileIdentity {
  profileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

/**
 * Wallet summary for the collector profile read model.
 * chainDistribution here is unique-token counts per chain (from analysis).
 */
export interface CollectorProfileWalletSummary {
  verifiedWallets: readonly AnalyzedWalletRef[];
  walletCount: number;
  chainDistribution: ChainDistribution;
  /** Newest successful inventory sync across verified wallets. */
  latestSuccessfulSync: string | null;
}

/**
 * Inventory summary for the collector profile read model.
 * Subset of PR6 CollectorInventorySummary — no scores, pricing, or rarity.
 */
export interface CollectorProfileInventorySummary {
  totalCollections: number;
  uniqueTokenCount: number;
  totalQuantity: string;
  duplicateAssets: readonly DuplicateAsset[];
}

/**
 * Per-collection summary exposed on the profile read model.
 * Mirrors PR6 CollectionAggregation without ownershipRecordCount.
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
 * Internal composition object — not a UI DTO and not a score.
 */
export interface CollectorProfile {
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
