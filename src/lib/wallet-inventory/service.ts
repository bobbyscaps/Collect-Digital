import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import { isWalletChainNamespace } from "@/lib/profile-wallets/normalization";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  InventoryProviderMissingError,
  InventorySyncFailedError,
  InventoryUnsupportedNamespaceError,
  InventoryWalletNotFoundError,
  WalletDisconnectedError,
  WalletNotVerifiedError,
  WalletPendingError,
  WalletRevokedError,
  type NormalizedHolding,
  type WalletInventorySync,
} from "@/lib/wallet-inventory/domain";
import { normalizeProviderHoldings } from "@/lib/wallet-inventory/normalization";
import type { WalletInventoryProviderRegistry } from "@/lib/wallet-inventory/providers";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";

export interface SyncWalletInventoryRequest {
  walletId: string;
  now?: Date;
}

export interface SyncWalletInventoryResult {
  wallet: ProfileWallet;
  sync: WalletInventorySync;
  holdings: readonly NormalizedHolding[];
  removedCount: number;
  writtenCount: number;
}

export interface WalletInventoryService {
  /**
   * Synchronously ingests holdings for a verified wallet.
   *
   * Sequence:
   * 1. begin sync
   * 2. fetch complete provider inventory (throw on partial failure)
   * 3. normalize
   * 4. atomically replace inventory (upsert changed + remove stale)
   * 5. mark sync completed
   *
   * On any failure after begin: mark Failed, do not remove holdings,
   * preserve previous successful inventory.
   */
  syncVerifiedWalletInventory(
    request: SyncWalletInventoryRequest
  ): Promise<SyncWalletInventoryResult>;
  listHoldingsByWallet(walletId: string): Promise<readonly NormalizedHolding[]>;
  getLatestSync(walletId: string): Promise<WalletInventorySync | null>;
}

export interface CreateWalletInventoryServiceOptions {
  profileWallets: ProfileWalletRepository;
  inventory: WalletInventoryRepository;
  providers: WalletInventoryProviderRegistry;
}

/**
 * Enforces that only verified, connected wallets may sync inventory.
 * Returns explicit domain errors for pending/revoked/disconnected states.
 */
export function assertWalletEligibleForInventorySync(
  wallet: ProfileWallet
): void {
  if (wallet.disconnectedAt != null) {
    throw new WalletDisconnectedError(
      `Wallet ${wallet.id} is disconnected and cannot synchronize inventory.`
    );
  }

  if (wallet.verificationStatus === "pending") {
    throw new WalletPendingError(
      `Wallet ${wallet.id} is pending verification and cannot synchronize inventory.`
    );
  }

  if (wallet.verificationStatus === "revoked") {
    throw new WalletRevokedError(
      `Wallet ${wallet.id} is revoked and cannot synchronize inventory.`
    );
  }

  if (wallet.verificationStatus !== "verified") {
    throw new WalletNotVerifiedError(
      `Wallet ${wallet.id} is not verified and cannot synchronize inventory.`
    );
  }
}

export function createWalletInventoryService(
  options: CreateWalletInventoryServiceOptions
): WalletInventoryService {
  return {
    async syncVerifiedWalletInventory(
      request: SyncWalletInventoryRequest
    ): Promise<SyncWalletInventoryResult> {
      const wallet = await options.profileWallets.findWalletById(
        request.walletId
      );
      if (!wallet) {
        throw new InventoryWalletNotFoundError(
          `Profile wallet not found: ${request.walletId}`
        );
      }

      assertWalletEligibleForInventorySync(wallet);

      if (!isWalletChainNamespace(wallet.chainNamespace)) {
        throw new InventoryUnsupportedNamespaceError(
          String(wallet.chainNamespace)
        );
      }

      const provider = options.providers.get(wallet.chainNamespace);
      if (!provider) {
        throw new InventoryProviderMissingError(wallet.chainNamespace);
      }

      const startedAtDate = request.now ?? new Date();
      const startedAt = startedAtDate.toISOString();
      const sync = await options.inventory.startSync({
        walletId: wallet.id,
        provider: provider.providerKey,
        syncStartedAt: startedAt,
      });

      try {
        // Fetch must complete fully or throw. Never cleanup on incomplete fetch.
        const fetchResult = await provider.fetchHoldings({
          chainNamespace: wallet.chainNamespace,
          ownerAddress: wallet.address,
        });

        const lastSeenAt = (request.now ?? new Date()).toISOString();
        const normalized = normalizeProviderHoldings(fetchResult.items, {
          wallet,
          sourceProvider: fetchResult.provider,
          lastSeenAt,
        });

        // Atomic snapshot apply: no partial inventory replacement.
        const replaced = await options.inventory.replaceWalletInventory({
          walletId: wallet.id,
          holdings: normalized,
        });

        const completedAt = (request.now ?? new Date()).toISOString();
        const completed = await options.inventory.completeSync({
          syncId: sync.id,
          syncStatus: "success",
          syncCompletedAt: completedAt,
          errorMessage: null,
        });

        return {
          wallet,
          sync: completed,
          holdings: replaced.holdings,
          removedCount: replaced.removedCount,
          writtenCount: replaced.writtenCount,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Wallet inventory synchronization failed.";

        // Stale cleanup is never reached on this path; previous inventory stands.
        await options.inventory.completeSync({
          syncId: sync.id,
          syncStatus: "failure",
          syncCompletedAt: (request.now ?? new Date()).toISOString(),
          errorMessage: message,
        });

        if (error instanceof InventorySyncFailedError) {
          throw error;
        }

        throw new InventorySyncFailedError(message);
      }
    },

    async listHoldingsByWallet(
      walletId: string
    ): Promise<readonly NormalizedHolding[]> {
      return options.inventory.listHoldingsByWallet(walletId);
    },

    async getLatestSync(
      walletId: string
    ): Promise<WalletInventorySync | null> {
      return options.inventory.findLatestSync(walletId);
    },
  };
}
