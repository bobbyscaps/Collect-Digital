import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";
import {
  aggregateCollections,
  buildCollectorSummary,
  resolveLastInventorySync,
  selectVerifiedConnectedWallets,
  sortHoldingsDeterministically,
} from "@/lib/collector-analysis/aggregation";
import type {
  AnalyzedWalletRef,
  CollectorInventoryAnalysis,
  WalletInventoryFreshness,
} from "@/lib/collector-analysis/domain";

export interface AnalyzeCollectorInventoryRequest {
  profileId: string;
}

export interface CollectorAnalysisService {
  /**
   * Analyzes normalized inventory for a collector's verified wallets.
   *
   * Read-only: never syncs, never writes holdings, never calls providers,
   * never persists scores or derived summaries.
   * Does not calculate Collection Scores or Collector Scores.
   *
   * Eligibility uses the current wallet registry status. Holdings left behind
   * by a previously synced wallet that is now revoked/disconnected/pending
   * are not included.
   */
  analyzeCollectorInventory(
    request: AnalyzeCollectorInventoryRequest
  ): Promise<CollectorInventoryAnalysis>;
}

export interface CreateCollectorAnalysisServiceOptions {
  profileWallets: ProfileWalletRepository;
  inventory: WalletInventoryRepository;
}

function toWalletRef(wallet: {
  id: string;
  chainNamespace: AnalyzedWalletRef["chainNamespace"];
  address: string;
  normalizedAddress: string;
}): AnalyzedWalletRef {
  return Object.freeze({
    walletId: wallet.id,
    chainNamespace: wallet.chainNamespace,
    address: wallet.address,
    normalizedAddress: wallet.normalizedAddress,
  });
}

export function createCollectorAnalysisService(
  options: CreateCollectorAnalysisServiceOptions
): CollectorAnalysisService {
  return {
    async analyzeCollectorInventory(
      request: AnalyzeCollectorInventoryRequest
    ): Promise<CollectorInventoryAnalysis> {
      const wallets = await options.profileWallets.listWalletsByProfile(
        request.profileId
      );
      const verifiedWallets = selectVerifiedConnectedWallets(wallets);
      const walletIds = verifiedWallets.map((wallet) => wallet.id);

      const holdings =
        walletIds.length === 0
          ? Object.freeze([])
          : sortHoldingsDeterministically(
              await options.inventory.listHoldingsByWallets(walletIds)
            );

      const collections = aggregateCollections(holdings);

      const latestSuccessfulSyncs =
        await options.inventory.findLatestSuccessfulSyncs(walletIds);
      const walletFreshness: WalletInventoryFreshness[] = walletIds.map(
        (walletId) => {
          const sync = latestSuccessfulSyncs.get(walletId) ?? null;
          return Object.freeze({
            walletId,
            lastSuccessfulSyncAt: sync
              ? (sync.syncCompletedAt ?? sync.syncStartedAt)
              : null,
          });
        }
      );

      const lastInventorySync = resolveLastInventorySync(
        walletFreshness.map((entry) => entry.lastSuccessfulSyncAt)
      );

      const summary = buildCollectorSummary({
        verifiedWallets,
        holdings,
        collections,
        lastInventorySync,
        walletFreshness,
      });

      return Object.freeze({
        profileId: request.profileId,
        verifiedWallets: Object.freeze(verifiedWallets.map(toWalletRef)),
        summary,
        collections,
        holdings,
      });
    },
  };
}
