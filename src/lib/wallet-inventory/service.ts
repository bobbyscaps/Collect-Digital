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
  holdingIdentityKey,
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
}

export interface WalletInventoryService {
  /**
   * Synchronously ingests holdings for a verified wallet, normalizes provider
   * responses, upserts holdings, removes stale rows, and records sync status.
   * Does not calculate collector metrics or scores.
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

      const now = request.now ?? new Date();
      const startedAt = now.toISOString();
      const sync = await options.inventory.startSync({
        walletId: wallet.id,
        provider: provider.providerKey,
        syncStartedAt: startedAt,
      });

      try {
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

        const upserted = await options.inventory.upsertHoldings(normalized);
        const keepKeys = new Set(
          normalized.map((holding) => holdingIdentityKey(holding))
        );
        const removedCount = await options.inventory.removeHoldingsNotIn(
          wallet.id,
          keepKeys
        );

        const completed = await options.inventory.completeSync({
          syncId: sync.id,
          syncStatus: "success",
          syncCompletedAt: (request.now ?? new Date()).toISOString(),
          errorMessage: null,
        });

        return {
          wallet,
          sync: completed,
          holdings: upserted,
          removedCount,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Wallet inventory synchronization failed.";

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
