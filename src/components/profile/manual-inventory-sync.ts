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
  status: ManualInventorySyncStatus | null;
}

export interface ManualInventorySyncStatus {
  kind: "success" | "error";
  message: string;
  details: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
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
  const details = {
    attempted: result.attempted,
    succeeded: result.succeeded,
    failed: failureCount,
  };

  let status: ManualInventorySyncStatus | null = null;
  if (failureCount > 0) {
    const firstFailure = result.failures[0];
    status = {
      kind: "error",
      message:
        result.succeeded > 0
          ? `Some wallets failed to sync. ${firstFailure.message}`
          : firstFailure.message,
      details,
    };
  } else if (result.succeeded > 0) {
    status = {
      kind: "success",
      message: "Inventory updated.",
      details,
    };
  }

  return {
    shouldRefreshIdentity,
    status,
  };
}
