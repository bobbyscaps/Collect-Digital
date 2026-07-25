import { selectVerifiedConnectedWallets } from "@/lib/collector-analysis/aggregation";
import type { CollectorInventoryAnalysis } from "@/lib/collector-analysis/domain";
import type { CollectorAnalysisService } from "@/lib/collector-analysis/service";
import {
  InventoryUnavailableError,
  NoVerifiedWalletsError,
  CollectorProfileNotFoundError,
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
 * services. Does not sync wallets, call providers, or calculate scores.
 */
export interface CollectorProfileService {
  getCollectorProfile(
    request: GetCollectorProfileRequest
  ): Promise<CollectorProfile>;
}

export interface CreateCollectorProfileServiceOptions {
  profileWallets: ProfileWalletRepository;
  inventory: WalletInventoryRepository;
  analysis: CollectorAnalysisService;
}

function toCollectionSummaries(
  analysis: CollectorInventoryAnalysis
): readonly CollectorProfileCollectionSummary[] {
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

function composeProfile(
  analysis: CollectorInventoryAnalysis
): CollectorProfile {
  return Object.freeze({
    identity: Object.freeze({
      profileId: analysis.profileId,
      // Identity enrichment is out of scope for PR7; fields remain nullable.
      displayName: null,
      avatarUrl: null,
      bio: null,
    }),
    walletSummary: Object.freeze({
      verifiedWallets: analysis.verifiedWallets,
      walletCount: analysis.verifiedWallets.length,
      chainDistribution: analysis.summary.chainDistribution,
      latestSuccessfulSync: analysis.summary.lastInventorySync,
    }),
    inventorySummary: Object.freeze({
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
  return {
    /**
     * Assembles a profile-ready read model for a collector.
     *
     * Read-only composition path:
     * 1. Wallet registry — existence + verified-wallet eligibility
     * 2. CollectorAnalysisService — inventory + collection aggregates
     *    (which reads Wallet Inventory Repository with batched lookups)
     *
     * Never performs blockchain calls, wallet sync, or score calculation.
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

      const verifiedWallets = selectVerifiedConnectedWallets(wallets);
      if (verifiedWallets.length === 0) {
        throw new NoVerifiedWalletsError(profileId);
      }

      // Batched inventory probe (no N+1). Analysis then composes holdings +
      // aggregates via the same repository contract; profile does not re-fetch
      // holdings or re-implement aggregation.
      try {
        await options.inventory.findLatestSuccessfulSyncs(
          verifiedWallets.map((wallet) => wallet.id)
        );
      } catch (cause) {
        throw new InventoryUnavailableError(profileId, cause);
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
        throw new InventoryUnavailableError(profileId, cause);
      }

      if (analysis.verifiedWallets.length === 0) {
        throw new NoVerifiedWalletsError(profileId);
      }

      return composeProfile(analysis);
    },
  };
}
