import { randomUUID } from "node:crypto";

import type {
  NormalizedHolding,
  WalletInventorySync,
  WalletInventorySyncStatus,
} from "@/lib/wallet-inventory/domain";
import {
  holdingIdentityKey,
  isHoldingUnchanged,
} from "@/lib/wallet-inventory/domain";

export type UpsertHoldingInput = Omit<
  NormalizedHolding,
  "id" | "createdAt" | "updatedAt"
>;

export interface StartInventorySyncInput {
  walletId: string;
  provider: string;
  syncStartedAt?: string;
}

export interface CompleteInventorySyncInput {
  syncId: string;
  syncStatus: Extract<WalletInventorySyncStatus, "success" | "failure">;
  syncCompletedAt?: string;
  errorMessage?: string | null;
}

export interface WalletInventoryRepository {
  upsertHoldings(
    holdings: readonly UpsertHoldingInput[]
  ): Promise<readonly NormalizedHolding[]>;
  listHoldingsByWallet(walletId: string): Promise<readonly NormalizedHolding[]>;
  /**
   * Removes holdings for a wallet whose identity keys are not in keepKeys.
   * keepKeys use holdingIdentityKey(...) format.
   */
  removeHoldingsNotIn(
    walletId: string,
    keepKeys: ReadonlySet<string>
  ): Promise<number>;
  startSync(input: StartInventorySyncInput): Promise<WalletInventorySync>;
  completeSync(input: CompleteInventorySyncInput): Promise<WalletInventorySync>;
  findLatestSync(walletId: string): Promise<WalletInventorySync | null>;
  updateSyncStatus(
    syncId: string,
    syncStatus: WalletInventorySyncStatus,
    errorMessage?: string | null
  ): Promise<WalletInventorySync>;
}

function nowIso(now?: Date) {
  return (now ?? new Date()).toISOString();
}

function freezeHolding(holding: NormalizedHolding): Readonly<NormalizedHolding> {
  return Object.freeze({ ...holding });
}

function freezeSync(sync: WalletInventorySync): Readonly<WalletInventorySync> {
  return Object.freeze({ ...sync });
}

export function createInMemoryWalletInventoryRepository(): WalletInventoryRepository {
  const holdings = new Map<string, NormalizedHolding>();
  const holdingsByWallet = new Map<string, Set<string>>();
  const syncs = new Map<string, WalletInventorySync>();
  const latestSyncByWallet = new Map<string, string>();

  function trackWalletHolding(walletId: string, identity: string) {
    const set = holdingsByWallet.get(walletId) ?? new Set<string>();
    set.add(identity);
    holdingsByWallet.set(walletId, set);
  }

  function untrackWalletHolding(walletId: string, identity: string) {
    const set = holdingsByWallet.get(walletId);
    if (!set) return;
    set.delete(identity);
    if (set.size === 0) {
      holdingsByWallet.delete(walletId);
    }
  }

  return {
    async upsertHoldings(
      inputs: readonly UpsertHoldingInput[]
    ): Promise<readonly NormalizedHolding[]> {
      const results: NormalizedHolding[] = [];
      const timestamp = nowIso();

      for (const input of inputs) {
        const identity = holdingIdentityKey(input);
        const existing = holdings.get(identity);

        if (existing && isHoldingUnchanged(existing, input)) {
          // Touch lastSeenAt only — avoid duplicating unchanged holdings.
          if (existing.lastSeenAt !== input.lastSeenAt) {
            const touched: NormalizedHolding = {
              ...existing,
              lastSeenAt: input.lastSeenAt,
              updatedAt: timestamp,
            };
            holdings.set(identity, touched);
            results.push(freezeHolding(touched));
          } else {
            results.push(freezeHolding(existing));
          }
          continue;
        }

        const next: NormalizedHolding = existing
          ? {
              ...existing,
              ...input,
              id: existing.id,
              createdAt: existing.createdAt,
              updatedAt: timestamp,
            }
          : {
              ...input,
              id: randomUUID(),
              createdAt: timestamp,
              updatedAt: timestamp,
            };

        holdings.set(identity, next);
        trackWalletHolding(input.walletId, identity);
        results.push(freezeHolding(next));
      }

      return Object.freeze(results);
    },

    async listHoldingsByWallet(
      walletId: string
    ): Promise<readonly NormalizedHolding[]> {
      const identities = holdingsByWallet.get(walletId);
      if (!identities) return Object.freeze([]);

      return Object.freeze(
        Array.from(identities)
          .map((identity) => holdings.get(identity))
          .filter((holding): holding is NormalizedHolding => Boolean(holding))
          .sort((a, b) => {
            const byContract = a.contractAddress.localeCompare(b.contractAddress);
            if (byContract !== 0) return byContract;
            return a.tokenId.localeCompare(b.tokenId);
          })
          .map(freezeHolding)
      );
    },

    async removeHoldingsNotIn(
      walletId: string,
      keepKeys: ReadonlySet<string>
    ): Promise<number> {
      const identities = holdingsByWallet.get(walletId);
      if (!identities) return 0;

      let removed = 0;
      for (const identity of Array.from(identities)) {
        if (keepKeys.has(identity)) continue;
        holdings.delete(identity);
        untrackWalletHolding(walletId, identity);
        removed += 1;
      }
      return removed;
    },

    async startSync(input: StartInventorySyncInput): Promise<WalletInventorySync> {
      const timestamp = input.syncStartedAt ?? nowIso();
      const sync: WalletInventorySync = {
        id: randomUUID(),
        walletId: input.walletId,
        provider: input.provider,
        syncStatus: "running",
        syncStartedAt: timestamp,
        syncCompletedAt: null,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      syncs.set(sync.id, sync);
      latestSyncByWallet.set(input.walletId, sync.id);
      return freezeSync(sync);
    },

    async completeSync(
      input: CompleteInventorySyncInput
    ): Promise<WalletInventorySync> {
      const existing = syncs.get(input.syncId);
      if (!existing) {
        throw new Error(`Inventory sync not found: ${input.syncId}`);
      }
      const completedAt = input.syncCompletedAt ?? nowIso();
      const updated: WalletInventorySync = {
        ...existing,
        syncStatus: input.syncStatus,
        syncCompletedAt: completedAt,
        errorMessage: input.errorMessage ?? null,
        updatedAt: completedAt,
      };
      syncs.set(updated.id, updated);
      latestSyncByWallet.set(updated.walletId, updated.id);
      return freezeSync(updated);
    },

    async findLatestSync(walletId: string): Promise<WalletInventorySync | null> {
      const id = latestSyncByWallet.get(walletId);
      if (!id) return null;
      const sync = syncs.get(id);
      return sync ? freezeSync(sync) : null;
    },

    async updateSyncStatus(
      syncId: string,
      syncStatus: WalletInventorySyncStatus,
      errorMessage?: string | null
    ): Promise<WalletInventorySync> {
      const existing = syncs.get(syncId);
      if (!existing) {
        throw new Error(`Inventory sync not found: ${syncId}`);
      }
      const timestamp = nowIso();
      const updated: WalletInventorySync = {
        ...existing,
        syncStatus,
        errorMessage: errorMessage ?? null,
        syncCompletedAt:
          syncStatus === "success" || syncStatus === "failure"
            ? existing.syncCompletedAt ?? timestamp
            : existing.syncCompletedAt,
        updatedAt: timestamp,
      };
      syncs.set(syncId, updated);
      return freezeSync(updated);
    },
  };
}
