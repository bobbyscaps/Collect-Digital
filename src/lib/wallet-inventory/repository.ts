import { randomUUID } from "node:crypto";

import type {
  NormalizedHolding,
  WalletInventorySync,
  WalletInventorySyncStatus,
} from "@/lib/wallet-inventory/domain";
import {
  computeSyncDurationMs,
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

export interface ReplaceWalletInventoryInput {
  walletId: string;
  holdings: readonly UpsertHoldingInput[];
}

export interface ReplaceWalletInventoryResult {
  holdings: readonly NormalizedHolding[];
  removedCount: number;
  writtenCount: number;
}

export interface WalletInventoryRepository {
  upsertHoldings(
    holdings: readonly UpsertHoldingInput[]
  ): Promise<readonly NormalizedHolding[]>;
  listHoldingsByWallet(walletId: string): Promise<readonly NormalizedHolding[]>;
  /**
   * Read-only: retrieve normalized holdings for many wallets (order undefined).
   * Used by collector analysis; never mutates inventory.
   */
  listHoldingsByWallets(
    walletIds: readonly string[]
  ): Promise<readonly NormalizedHolding[]>;
  /**
   * Read-only: retrieve holdings grouped by stable collection identity
   * (`${chainNamespace}:${contractAddress}`).
   */
  listHoldingsByCollection(
    collectionId: string
  ): Promise<readonly NormalizedHolding[]>;
  /**
   * Removes holdings for a wallet whose identity keys are not in keepKeys.
   * keepKeys use holdingIdentityKey(...) format.
   * Callers must only invoke this after a complete successful provider fetch.
   */
  removeHoldingsNotIn(
    walletId: string,
    keepKeys: ReadonlySet<string>
  ): Promise<number>;
  /**
   * Atomically applies a full inventory snapshot for one wallet:
   * upsert changed rows, skip unchanged (no timestamp churn), remove stale.
   * On failure, previous holdings remain intact.
   */
  replaceWalletInventory(
    input: ReplaceWalletInventoryInput
  ): Promise<ReplaceWalletInventoryResult>;
  startSync(input: StartInventorySyncInput): Promise<WalletInventorySync>;
  completeSync(input: CompleteInventorySyncInput): Promise<WalletInventorySync>;
  findLatestSync(walletId: string): Promise<WalletInventorySync | null>;
  /**
   * Read-only: latest sync with syncStatus === "success" for a wallet.
   * Failed/running/idle syncs are ignored so freshness reflects completed work.
   */
  findLatestSuccessfulSync(
    walletId: string
  ): Promise<WalletInventorySync | null>;
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
  const syncIdsByWallet = new Map<string, string[]>();
  const latestSyncByWallet = new Map<string, string>();

  function trackWalletSync(walletId: string, syncId: string) {
    const list = syncIdsByWallet.get(walletId) ?? [];
    if (!list.includes(syncId)) {
      list.push(syncId);
      syncIdsByWallet.set(walletId, list);
    }
  }

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

  function listWalletIdentities(walletId: string): string[] {
    return Array.from(holdingsByWallet.get(walletId) ?? []);
  }

  function buildNextHolding(
    input: UpsertHoldingInput,
    existing: NormalizedHolding | undefined,
    timestamp: string
  ): { holding: NormalizedHolding; written: boolean } {
    if (existing && isHoldingUnchanged(existing, input)) {
      // Idempotent: preserve every field including timestamps.
      return { holding: existing, written: false };
    }

    if (existing) {
      return {
        holding: {
          ...existing,
          ...input,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: timestamp,
        },
        written: true,
      };
    }

    return {
      holding: {
        ...input,
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      written: true,
    };
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
        const { holding, written } = buildNextHolding(input, existing, timestamp);
        if (written) {
          holdings.set(identity, holding);
          trackWalletHolding(input.walletId, identity);
        }
        results.push(freezeHolding(holding));
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

    async listHoldingsByWallets(
      walletIds: readonly string[]
    ): Promise<readonly NormalizedHolding[]> {
      if (walletIds.length === 0) return Object.freeze([]);

      const wanted = new Set(walletIds);
      const results: NormalizedHolding[] = [];
      for (const walletId of wanted) {
        const identities = holdingsByWallet.get(walletId);
        if (!identities) continue;
        for (const identity of identities) {
          const holding = holdings.get(identity);
          if (holding) results.push(holding);
        }
      }

      return Object.freeze(
        results
          .sort((a, b) => {
            const byWallet = a.walletId.localeCompare(b.walletId);
            if (byWallet !== 0) return byWallet;
            const byContract = a.contractAddress.localeCompare(b.contractAddress);
            if (byContract !== 0) return byContract;
            return a.tokenId.localeCompare(b.tokenId);
          })
          .map(freezeHolding)
      );
    },

    async listHoldingsByCollection(
      collectionId: string
    ): Promise<readonly NormalizedHolding[]> {
      const results: NormalizedHolding[] = [];
      for (const holding of holdings.values()) {
        if (holding.collectionId === collectionId) {
          results.push(holding);
        }
      }

      return Object.freeze(
        results
          .sort((a, b) => {
            const byWallet = a.walletId.localeCompare(b.walletId);
            if (byWallet !== 0) return byWallet;
            return a.tokenId.localeCompare(b.tokenId);
          })
          .map(freezeHolding)
      );
    },

    async removeHoldingsNotIn(
      walletId: string,
      keepKeys: ReadonlySet<string>
    ): Promise<number> {
      const identities = listWalletIdentities(walletId);
      let removed = 0;
      for (const identity of identities) {
        if (keepKeys.has(identity)) continue;
        holdings.delete(identity);
        untrackWalletHolding(walletId, identity);
        removed += 1;
      }
      return removed;
    },

    async replaceWalletInventory(
      input: ReplaceWalletInventoryInput
    ): Promise<ReplaceWalletInventoryResult> {
      const timestamp = nowIso();
      const previousIdentities = listWalletIdentities(input.walletId);
      const previousSnapshot = new Map<string, NormalizedHolding>();
      for (const identity of previousIdentities) {
        const holding = holdings.get(identity);
        if (holding) {
          previousSnapshot.set(identity, { ...holding });
        }
      }

      try {
        const keepKeys = new Set<string>();
        const nextByIdentity = new Map<string, NormalizedHolding>();
        let writtenCount = 0;

        for (const holdingInput of input.holdings) {
          if (holdingInput.walletId !== input.walletId) {
            throw new Error(
              `Holding walletId ${holdingInput.walletId} does not match replace target ${input.walletId}`
            );
          }
          const identity = holdingIdentityKey(holdingInput);
          keepKeys.add(identity);
          const existing = previousSnapshot.get(identity);
          const { holding, written } = buildNextHolding(
            holdingInput,
            existing,
            timestamp
          );
          if (written) writtenCount += 1;
          nextByIdentity.set(identity, holding);
        }

        let removedCount = 0;
        for (const identity of previousIdentities) {
          if (!keepKeys.has(identity)) {
            removedCount += 1;
          }
        }

        // Commit as one swap: clear previous wallet entries, then write next.
        for (const identity of previousIdentities) {
          holdings.delete(identity);
          untrackWalletHolding(input.walletId, identity);
        }
        for (const [identity, holding] of nextByIdentity) {
          holdings.set(identity, holding);
          trackWalletHolding(input.walletId, identity);
        }

        const resultHoldings = Object.freeze(
          Array.from(nextByIdentity.values())
            .sort((a, b) => {
              const byContract = a.contractAddress.localeCompare(b.contractAddress);
              if (byContract !== 0) return byContract;
              return a.tokenId.localeCompare(b.tokenId);
            })
            .map(freezeHolding)
        );

        return {
          holdings: resultHoldings,
          removedCount,
          writtenCount,
        };
      } catch (error) {
        // Roll back to previous successful inventory.
        for (const identity of listWalletIdentities(input.walletId)) {
          holdings.delete(identity);
          untrackWalletHolding(input.walletId, identity);
        }
        for (const [identity, holding] of previousSnapshot) {
          holdings.set(identity, holding);
          trackWalletHolding(input.walletId, identity);
        }
        throw error;
      }
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
        durationMs: null,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      syncs.set(sync.id, sync);
      trackWalletSync(input.walletId, sync.id);
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
        durationMs: computeSyncDurationMs(existing.syncStartedAt, completedAt),
        errorMessage: input.errorMessage ?? null,
        updatedAt: completedAt,
      };
      syncs.set(updated.id, updated);
      trackWalletSync(updated.walletId, updated.id);
      latestSyncByWallet.set(updated.walletId, updated.id);
      return freezeSync(updated);
    },

    async findLatestSync(walletId: string): Promise<WalletInventorySync | null> {
      const id = latestSyncByWallet.get(walletId);
      if (!id) return null;
      const sync = syncs.get(id);
      return sync ? freezeSync(sync) : null;
    },

    async findLatestSuccessfulSync(
      walletId: string
    ): Promise<WalletInventorySync | null> {
      const ids = syncIdsByWallet.get(walletId) ?? [];
      let latest: WalletInventorySync | null = null;
      let latestMs = Number.NEGATIVE_INFINITY;

      for (const id of ids) {
        const sync = syncs.get(id);
        if (!sync || sync.syncStatus !== "success") continue;
        const stamp = sync.syncCompletedAt ?? sync.syncStartedAt;
        const ms = Date.parse(stamp);
        if (Number.isNaN(ms)) continue;
        if (ms > latestMs) {
          latestMs = ms;
          latest = sync;
        }
      }

      return latest ? freezeSync(latest) : null;
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
      const completedAt =
        syncStatus === "success" || syncStatus === "failure"
          ? existing.syncCompletedAt ?? timestamp
          : existing.syncCompletedAt;
      const updated: WalletInventorySync = {
        ...existing,
        syncStatus,
        errorMessage: errorMessage ?? null,
        syncCompletedAt: completedAt,
        durationMs:
          completedAt != null
            ? computeSyncDurationMs(existing.syncStartedAt, completedAt)
            : null,
        updatedAt: timestamp,
      };
      syncs.set(syncId, updated);
      return freezeSync(updated);
    },
  };
}
