import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";
import { syncVerifiedWalletInventory } from "@/lib/wallet-verification-flow/client";

export interface ManualInventorySyncFailure {
  walletId: string;
  message: string;
}

export interface ManualInventorySyncResult {
  attempted: number;
  succeeded: number;
  failures: readonly ManualInventorySyncFailure[];
}

export interface ManualInventorySyncFeedback {
  shouldRefreshIdentity: boolean;
  successMessage: string | null;
  errorMessage: string | null;
}

type SyncWalletInventoryClient = typeof syncVerifiedWalletInventory;

export function getVerifiedWalletIdsForSync(
  identity: CollectorIdentityResponse | null | undefined
): readonly string[] {
  const wallets = identity?.wallets.data?.verifiedWallets;
  if (!wallets || wallets.length === 0) return Object.freeze([]);
  const ids = wallets
    .map((wallet) => wallet.walletId)
    .filter((walletId) => typeof walletId === "string" && walletId.length > 0);
  return Object.freeze(Array.from(new Set(ids)));
}

export function canShowSyncCollectiblesAction(input: {
  isOwner: boolean;
  verifiedWalletIds: readonly string[];
  registryUnavailable: boolean;
  verificationSessionActive: boolean;
}): boolean {
  return (
    input.isOwner &&
    input.verifiedWalletIds.length > 0 &&
    !input.registryUnavailable &&
    !input.verificationSessionActive
  );
}

export function getSyncCollectiblesButtonLabel(syncing: boolean): string {
  return syncing ? "Syncing..." : "Sync Collectibles";
}

export function isSyncCollectiblesButtonDisabled(syncing: boolean): boolean {
  return syncing;
}

export async function syncVerifiedWalletInventories(input: {
  accessToken: string;
  walletIds: readonly string[];
  syncInventory?: SyncWalletInventoryClient;
}): Promise<ManualInventorySyncResult> {
  const syncInventory = input.syncInventory ?? syncVerifiedWalletInventory;
  const failures: ManualInventorySyncFailure[] = [];
  let succeeded = 0;

  for (const walletId of input.walletIds) {
    try {
      const response = await syncInventory({
        accessToken: input.accessToken,
        walletId,
      });
      if (response.inventorySync.status === "success") {
        succeeded += 1;
        continue;
      }
      failures.push({
        walletId,
        message:
          response.inventorySync.errorMessage ??
          "Inventory synchronization failed.",
      });
    } catch (cause) {
      failures.push({
        walletId,
        message:
          cause instanceof Error
            ? cause.message
            : "Inventory synchronization failed.",
      });
    }
  }

  return {
    attempted: input.walletIds.length,
    succeeded,
    failures: Object.freeze(failures),
  };
}

export function buildManualInventorySyncFeedback(
  result: ManualInventorySyncResult
): ManualInventorySyncFeedback {
  const failureCount = result.failures.length;
  const shouldRefreshIdentity = result.succeeded > 0;
  const successMessage =
    result.succeeded === 0
      ? null
      : result.succeeded === 1
        ? "Collectibles synchronized for 1 verified wallet."
        : `Collectibles synchronized for ${result.succeeded} verified wallets.`;

  let errorMessage: string | null = null;
  if (failureCount > 0) {
    const firstFailure = result.failures[0];
    if (result.succeeded > 0) {
      errorMessage = `Synchronized ${result.succeeded} wallet(s), but ${failureCount} failed. ${firstFailure.message}`;
    } else {
      errorMessage = firstFailure.message;
    }
  }

  return {
    shouldRefreshIdentity,
    successMessage,
    errorMessage,
  };
}
