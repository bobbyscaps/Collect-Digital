import { selectVerifiedConnectedWallets } from "@/lib/collector-analysis/aggregation";
import type { CollectorInventoryAnalysis } from "@/lib/collector-analysis/domain";
import type { CollectorAnalysisService } from "@/lib/collector-analysis/service";
import {
  COLLECTOR_PROFILE_SCHEMA_VERSION,
  InventoryUnavailableError,
  NoVerifiedWalletsError,
  CollectorProfileNotFoundError,
  resolveInventoryStatus,
  type CollectorProfile,
  type CollectorProfileCollectionSummary,
} from "@/lib/collector-profile/domain";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";

export interface GetCollectorProfileRequest {
  profileId: string;
}

/**
 * Read-only service that composes a collector profile from existing domain
 * services. Assembles — does not analyze. Does not sync wallets, call
 * providers, or calculate scores.
 */
export interface CollectorProfileService {
  getCollectorProfile(
    request: GetCollectorProfileRequest
  ): Promise<CollectorProfile>;
}

export interface CreateCollectorProfileServiceOptions {
  profileWallets: ProfileWalletRepository;
  /**
   * Inventory repository used by CollectorAnalysisService.
   * Required so profile composition is wired through the same batched read
   * contract; the profile service does not issue a second holdings/sync pass.
   */
  inventory: WalletInventoryRepository;
  analysis: CollectorAnalysisService;
}

function assertBatchedInventoryContract(
  inventory: WalletInventoryRepository
): void {
  if (
    typeof inventory.listHoldingsByWallets !== "function" ||
    typeof inventory.findLatestSuccessfulSyncs !== "function"
  ) {
    throw new Error(
      "WalletInventoryRepository must expose batched reads for profile composition"
    );
  }
}

function toCollectionSummaries(
  analysis: CollectorInventoryAnalysis
): readonly CollectorProfileCollectionSummary[] {
  // Analysis already sorts collections by collectionId deterministically.
  return Object.freeze(
    analysis.collections.map((collection) =>
      Object.freeze({
        collectionId: collection.collectionId,
        chainNamespace: collection.chainNamespace,
        contractAddress: collection.contractAddress,
        uniqueTokenCount: collection.uniqueTokenCount,
        totalQuantity: collection.totalQuantity,
        walletsContainingCollection: collection.walletsContainingCollection,
      } satisfies CollectorProfileCollectionSummary)
    )
  );
}

/**
 * Assembles a CollectorProfile from analysis output.
 * Does not recalculate counts, chain distribution, duplicates, or summaries.
 */
function composeProfile(
  analysis: CollectorInventoryAnalysis
): CollectorProfile {
  const walletFreshness = analysis.summary.walletFreshness;
  return Object.freeze({
    schemaVersion: COLLECTOR_PROFILE_SCHEMA_VERSION,
    identity: Object.freeze({
      profileId: analysis.profileId,
      // Identity enrichment is out of scope for PR7; keys are always present.
      displayName: null,
      avatarUrl: null,
      bio: null,
    }),
    walletSummary: Object.freeze({
      verifiedWallets: analysis.verifiedWallets,
      walletCount: analysis.verifiedWallets.length,
      chainDistribution: analysis.summary.chainDistribution,
      latestSuccessfulSync: analysis.summary.lastInventorySync,
      walletFreshness,
    }),
    inventorySummary: Object.freeze({
      inventoryStatus: resolveInventoryStatus(walletFreshness),
      totalCollections: analysis.summary.totalCollections,
      uniqueTokenCount: analysis.summary.uniqueTokenCount,
      totalQuantity: analysis.summary.totalQuantity,
      duplicateAssets: analysis.summary.duplicateAssets,
    }),
    collectionSummaries: toCollectionSummaries(analysis),
  });
}

export function createCollectorProfileService(
  options: CreateCollectorProfileServiceOptions
): CollectorProfileService {
  assertBatchedInventoryContract(options.inventory);

  return {
    /**
     * Assembles a profile-ready read model for a collector.
     *
     * Repository call sequence (bounded; not linear in wallet count):
     * 1. `profileWallets.listWalletsByProfile(profileId)` — existence / eligibility
     * 2. Inside `analysis.analyzeCollectorInventory`:
     *    a. `profileWallets.listWalletsByProfile(profileId)` — verified set
     *    b. `inventory.listHoldingsByWallets(walletIds)` — one batched holdings read
     *    c. `inventory.findLatestSuccessfulSyncs(walletIds)` — one batched sync read
     *
     * Never performs blockchain calls, wallet sync, or score calculation.
     * Partial sync (some wallets never synced) still returns available data.
     */
    async getCollectorProfile(
      request: GetCollectorProfileRequest
    ): Promise<CollectorProfile> {
      const profileId = request.profileId.trim();
      if (!profileId) {
        throw new CollectorProfileNotFoundError(profileId || "(empty)");
      }

      const wallets = await options.profileWallets.listWalletsByProfile(
        profileId
      );
      if (wallets.length === 0) {
        throw new CollectorProfileNotFoundError(profileId);
      }

      // Eligibility orchestration only — reuses analysis helper, does not
      // recalculate inventory aggregates.
      const verifiedWallets = selectVerifiedConnectedWallets(wallets);
      if (verifiedWallets.length === 0) {
        throw new NoVerifiedWalletsError(profileId);
      }

      let analysis: CollectorInventoryAnalysis;
      try {
        analysis = await options.analysis.analyzeCollectorInventory({
          profileId,
        });
      } catch (cause) {
        if (
          cause instanceof CollectorProfileNotFoundError ||
          cause instanceof NoVerifiedWalletsError ||
          cause instanceof InventoryUnavailableError
        ) {
          throw cause;
        }
        // Reserved for cases where no usable inventory can be loaded at all.
        throw new InventoryUnavailableError(profileId, cause);
      }

      if (analysis.verifiedWallets.length === 0) {
        throw new NoVerifiedWalletsError(profileId);
      }

      return composeProfile(analysis);
    },
  };
}
