import { selectVerifiedConnectedWallets } from "@/lib/collector-analysis/aggregation";
import type { CollectorInventoryAnalysis } from "@/lib/collector-analysis/domain";
import type { CollectorAnalysisService } from "@/lib/collector-analysis/service";
import {
  InventoryUnavailableError,
  resolveInventoryStatus,
} from "@/lib/collector-profile/domain";
import {
  COLLECTOR_IDENTITY_API_SCHEMA_VERSION,
  comingSoonSection,
  emptySection,
  errorSection,
  type CollectorIdentityCollectionSummaryData,
  type CollectorIdentityInventoryData,
  type CollectorIdentityResponse,
  type CollectorIdentityWalletsData,
  type ProgressiveSection,
} from "@/lib/collector-identity/api-models";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";
import type { AuthenticatedProfileContext } from "@/lib/wallet-verification/auth-context";

/**
 * Authenticated Collector Identity assembler.
 *
 * Each section owns its own lifecycle. Failures in inventory must not prevent
 * wallets/identity from rendering. Wallet verification is always live (never
 * served from a stale verification snapshot).
 */
export interface CollectorIdentityService {
  getMyIdentity(
    auth: AuthenticatedProfileContext
  ): Promise<CollectorIdentityResponse>;
}

export interface CreateCollectorIdentityServiceOptions {
  profileWallets: ProfileWalletRepository;
  inventory: WalletInventoryRepository;
  analysis: CollectorAnalysisService;
}

function comingSoonStatusModules(): CollectorIdentityResponse["statusModules"] {
  return {
    collectorScore: comingSoonSection("Collector Score coming soon"),
    collectionScores: comingSoonSection("Collection Scores coming soon"),
    communities: comingSoonSection("Communities coming soon"),
    followers: comingSoonSection("Followers coming soon"),
    following: comingSoonSection("Following coming soon"),
  };
}

function composeIdentitySection(
  profileId: string
): ProgressiveSection<
  NonNullable<CollectorIdentityResponse["identity"]["data"]>
> {
  // PR7/PR8 identity enrichment is not persisted yet — keys are real nulls.
  return {
    state: "live",
    data: {
      profileId,
      displayName: null,
      avatarUrl: null,
      bio: null,
    },
    lastUpdatedAt: null,
    message: null,
  };
}

async function latestSuccessfulSyncAt(
  inventory: WalletInventoryRepository,
  walletIds: readonly string[]
): Promise<string | null> {
  const syncs = await inventory.findLatestSuccessfulSyncs([...walletIds]);
  let latest: string | null = null;
  for (const sync of syncs.values()) {
    const at = sync?.syncCompletedAt ?? null;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

function walletsFromVerified(
  verified: ReturnType<typeof selectVerifiedConnectedWallets>,
  latestSuccessfulSync: string | null,
  chainDistribution: CollectorIdentityWalletsData["chainDistribution"]
): ProgressiveSection<CollectorIdentityWalletsData> {
  const data: CollectorIdentityWalletsData = {
    verifiedWalletCount: verified.length,
    verifiedWallets: Object.freeze(
      verified.map((wallet) =>
        Object.freeze({
          walletId: wallet.id,
          chainNamespace: wallet.chainNamespace,
          address: wallet.address,
          normalizedAddress: wallet.normalizedAddress,
        })
      )
    ),
    latestSuccessfulSync,
    chainDistribution,
  };

  return {
    state: "live",
    data: Object.freeze(data),
    lastUpdatedAt: null,
    message: null,
  };
}

function inventoryFromAnalysis(analysis: CollectorInventoryAnalysis): {
  inventory: ProgressiveSection<CollectorIdentityInventoryData>;
  collectionSummaries: ProgressiveSection<
    readonly CollectorIdentityCollectionSummaryData[]
  >;
} {
  const inventoryStatus = resolveInventoryStatus(
    analysis.summary.walletFreshness
  );
  const lastUpdatedAt = analysis.summary.lastInventorySync;

  const inventoryData: CollectorIdentityInventoryData = {
    inventoryStatus,
    totalCollections: analysis.summary.totalCollections,
    uniqueTokenCount: analysis.summary.uniqueTokenCount,
    totalQuantity: analysis.summary.totalQuantity,
  };

  const collections: readonly CollectorIdentityCollectionSummaryData[] =
    Object.freeze(
      analysis.collections.map((collection) =>
        Object.freeze({
          collectionId: collection.collectionId,
          chainNamespace: collection.chainNamespace,
          contractAddress: collection.contractAddress,
          uniqueTokenCount: collection.uniqueTokenCount,
          totalQuantity: collection.totalQuantity,
          walletsContainingCollection: collection.walletsContainingCollection,
        } satisfies CollectorIdentityCollectionSummaryData)
      )
    );

  if (inventoryStatus === "unsynced") {
    return {
      inventory: {
        state: "empty",
        data: Object.freeze(inventoryData),
        lastUpdatedAt,
        message: "No successful inventory sync yet.",
      },
      collectionSummaries: {
        state: collections.length === 0 ? "empty" : "partial",
        data: collections,
        lastUpdatedAt,
        message:
          collections.length === 0
            ? "No collection summaries until inventory sync completes."
            : "Collection summaries from incomplete inventory sync.",
      },
    };
  }

  if (inventoryStatus === "partial") {
    return {
      inventory: {
        state: "partial",
        data: Object.freeze(inventoryData),
        lastUpdatedAt,
        message: "Some verified wallets have not synced successfully yet.",
      },
      collectionSummaries: {
        state: collections.length === 0 ? "empty" : "partial",
        data: collections,
        lastUpdatedAt,
        message:
          collections.length === 0
            ? "No collections in synced wallets yet."
            : null,
      },
    };
  }

  const inventoryLive: ProgressiveSection<CollectorIdentityInventoryData> = {
    state: "live",
    data: Object.freeze(inventoryData),
    lastUpdatedAt,
    message: null,
  };

  if (collections.length === 0) {
    return {
      inventory: inventoryLive,
      collectionSummaries: emptySection<
        readonly CollectorIdentityCollectionSummaryData[]
      >("No collections in verified wallet inventory."),
    };
  }

  return {
    inventory: inventoryLive,
    collectionSummaries: {
      state: "live",
      data: collections,
      lastUpdatedAt,
      message: null,
    },
  };
}

async function staleInventoryFallback(
  inventory: WalletInventoryRepository,
  verifiedWalletIds: readonly string[],
  cause: unknown
): Promise<{
  inventory: ProgressiveSection<CollectorIdentityInventoryData>;
  collectionSummaries: ProgressiveSection<
    readonly CollectorIdentityCollectionSummaryData[]
  >;
}> {
  try {
    const [holdings, lastUpdatedAt] = await Promise.all([
      inventory.listHoldingsByWallets([...verifiedWalletIds]),
      latestSuccessfulSyncAt(inventory, verifiedWalletIds),
    ]);

    if (holdings.length > 0 || lastUpdatedAt) {
      const uniqueTokens = new Set(
        holdings.map(
          (holding) =>
            `${holding.chainNamespace}:${holding.contractAddress}:${holding.tokenId}`
        )
      );
      const collections = new Set(
        holdings
          .map((holding) => holding.collectionId)
          .filter((id): id is string => Boolean(id))
      );
      let totalQuantity = 0n;
      for (const holding of holdings) {
        try {
          totalQuantity += BigInt(holding.quantity);
        } catch {
          // ignore non-integer quantities in stale fallback
        }
      }

      const staleInventory: CollectorIdentityInventoryData = {
        inventoryStatus: "partial",
        totalCollections: collections.size,
        uniqueTokenCount: uniqueTokens.size,
        totalQuantity: totalQuantity.toString(),
      };

      return {
        inventory: {
          state: "stale",
          data: Object.freeze(staleInventory),
          lastUpdatedAt,
          message:
            "Showing last successfully persisted inventory. Live refresh is unavailable.",
        },
        collectionSummaries: {
          state: "stale",
          data: Object.freeze([]),
          lastUpdatedAt,
          message:
            "Collection summaries unavailable from live analysis; last sync time shown.",
        },
      };
    }
  } catch {
    // Fall through to error.
  }

  const message =
    cause instanceof InventoryUnavailableError
      ? cause.message
      : cause instanceof Error
        ? cause.message
        : "Inventory unavailable.";

  return {
    inventory: errorSection<CollectorIdentityInventoryData>(message),
    collectionSummaries: errorSection<
      readonly CollectorIdentityCollectionSummaryData[]
    >(message),
  };
}

export function createCollectorIdentityService(
  options: CreateCollectorIdentityServiceOptions
): CollectorIdentityService {
  return {
    async getMyIdentity(
      auth: AuthenticatedProfileContext
    ): Promise<CollectorIdentityResponse> {
      const profileId = auth.profileId;
      const identity = composeIdentitySection(profileId);

      let wallets: ProgressiveSection<CollectorIdentityWalletsData>;
      let verifiedWalletIds: readonly string[] = [];
      let verifiedWallets: ReturnType<typeof selectVerifiedConnectedWallets> =
        [];

      try {
        const allWallets =
          await options.profileWallets.listWalletsByProfile(profileId);

        if (allWallets.length === 0) {
          wallets = emptySection<CollectorIdentityWalletsData>(
            "No wallets linked to this collector profile yet."
          );
        } else {
          // Verification is always current registry status — never stale.
          verifiedWallets = selectVerifiedConnectedWallets(allWallets);
          verifiedWalletIds = verifiedWallets.map((wallet) => wallet.id);

          if (verifiedWallets.length === 0) {
            wallets = emptySection<CollectorIdentityWalletsData>(
              "No verified wallets yet."
            );
          } else {
            let latestSuccessfulSync: string | null = null;
            try {
              latestSuccessfulSync = await latestSuccessfulSyncAt(
                options.inventory,
                verifiedWalletIds
              );
            } catch {
              latestSuccessfulSync = null;
            }

            wallets = walletsFromVerified(
              verifiedWallets,
              latestSuccessfulSync,
              Object.freeze({})
            );
          }
        }
      } catch (cause) {
        wallets = errorSection<CollectorIdentityWalletsData>(
          cause instanceof Error
            ? cause.message
            : "Unable to load verified wallets."
        );
      }

      let inventory: ProgressiveSection<CollectorIdentityInventoryData>;
      let collectionSummaries: ProgressiveSection<
        readonly CollectorIdentityCollectionSummaryData[]
      >;

      if (verifiedWalletIds.length === 0) {
        inventory = emptySection<CollectorIdentityInventoryData>(
          "Inventory requires at least one verified wallet."
        );
        collectionSummaries = emptySection<
          readonly CollectorIdentityCollectionSummaryData[]
        >("Collection summaries require at least one verified wallet.");
      } else {
        try {
          const analysis = await options.analysis.analyzeCollectorInventory({
            profileId,
          });

          // Enrich live wallets with analysis chain distribution / sync stamp.
          if (wallets.state === "live" && wallets.data) {
            wallets = walletsFromVerified(
              verifiedWallets,
              analysis.summary.lastInventorySync ??
                wallets.data.latestSuccessfulSync,
              analysis.summary.chainDistribution
            );
          }

          ({ inventory, collectionSummaries } =
            inventoryFromAnalysis(analysis));
        } catch (cause) {
          ({ inventory, collectionSummaries } = await staleInventoryFallback(
            options.inventory,
            verifiedWalletIds,
            cause
          ));
        }
      }

      return Object.freeze({
        schemaVersion: COLLECTOR_IDENTITY_API_SCHEMA_VERSION,
        profileId,
        identity,
        wallets,
        inventory,
        collectionSummaries,
        statusModules: comingSoonStatusModules(),
        achievements: comingSoonSection("Achievements coming soon"),
      });
    },
  };
}
