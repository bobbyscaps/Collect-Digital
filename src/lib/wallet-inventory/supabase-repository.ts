import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type {
  NormalizedHolding,
  WalletInventorySync,
  WalletInventorySyncStatus,
  AssetStandard,
} from "@/lib/wallet-inventory/domain";
import { holdingIdentityKey } from "@/lib/wallet-inventory/domain";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type {
  CompleteInventorySyncInput,
  StartInventorySyncInput,
  UpsertHoldingInput,
  WalletInventoryRepository,
} from "@/lib/wallet-inventory/repository";

interface WalletHoldingRow {
  id: string;
  wallet_id: string;
  chain_namespace: WalletChainNamespace;
  contract_address: string;
  token_id: string;
  asset_standard: AssetStandard;
  quantity: string;
  collection_id: string | null;
  owner_address: string;
  acquired_at: string | null;
  last_seen_at: string;
  source_provider: string;
  created_at: string;
  updated_at: string;
}

interface WalletInventorySyncRow {
  id: string;
  wallet_id: string;
  provider: string;
  sync_status: WalletInventorySyncStatus;
  sync_started_at: string;
  sync_completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function getAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function requireClient() {
  const client = getAdminClient();
  if (!client) {
    throw new Error(
      "Supabase admin client unavailable for WalletInventoryRepository."
    );
  }
  return client;
}

function mapHolding(row: WalletHoldingRow): NormalizedHolding {
  return {
    id: row.id,
    walletId: row.wallet_id,
    chainNamespace: row.chain_namespace,
    contractAddress: row.contract_address,
    tokenId: row.token_id,
    assetStandard: row.asset_standard,
    quantity: row.quantity,
    collectionId: row.collection_id,
    ownerAddress: row.owner_address,
    acquiredAt: row.acquired_at,
    lastSeenAt: row.last_seen_at,
    sourceProvider: row.source_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSync(row: WalletInventorySyncRow): WalletInventorySync {
  return {
    id: row.id,
    walletId: row.wallet_id,
    provider: row.provider,
    syncStatus: row.sync_status,
    syncStartedAt: row.sync_started_at,
    syncCompletedAt: row.sync_completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function holdingToRow(input: UpsertHoldingInput) {
  return {
    wallet_id: input.walletId,
    chain_namespace: input.chainNamespace,
    contract_address: input.contractAddress,
    token_id: input.tokenId,
    asset_standard: input.assetStandard,
    quantity: input.quantity,
    collection_id: input.collectionId,
    owner_address: input.ownerAddress,
    acquired_at: input.acquiredAt,
    last_seen_at: input.lastSeenAt,
    source_provider: input.sourceProvider,
    updated_at: new Date().toISOString(),
  };
}

export function createSupabaseWalletInventoryRepository(): WalletInventoryRepository {
  return {
    async upsertHoldings(
      holdings: readonly UpsertHoldingInput[]
    ): Promise<readonly NormalizedHolding[]> {
      if (holdings.length === 0) return Object.freeze([]);

      const client = requireClient();
      const rows = holdings.map(holdingToRow);
      const { data, error } = await client
        .from("wallet_holdings")
        .upsert(rows, {
          onConflict: "wallet_id,chain_namespace,contract_address,token_id",
        })
        .select("*");

      if (error) {
        throw new Error(`Failed to upsert wallet holdings: ${error.message}`);
      }

      return Object.freeze((data as WalletHoldingRow[]).map(mapHolding));
    },

    async listHoldingsByWallet(
      walletId: string
    ): Promise<readonly NormalizedHolding[]> {
      const client = requireClient();
      const { data, error } = await client
        .from("wallet_holdings")
        .select("*")
        .eq("wallet_id", walletId)
        .order("contract_address", { ascending: true })
        .order("token_id", { ascending: true });

      if (error) {
        throw new Error(`Failed to list wallet holdings: ${error.message}`);
      }

      return Object.freeze((data as WalletHoldingRow[]).map(mapHolding));
    },

    async removeHoldingsNotIn(
      walletId: string,
      keepKeys: ReadonlySet<string>
    ): Promise<number> {
      const client = requireClient();
      const existing = await this.listHoldingsByWallet(walletId);
      const toRemove = existing.filter(
        (holding) => !keepKeys.has(holdingIdentityKey(holding))
      );
      if (toRemove.length === 0) return 0;

      const ids = toRemove.map((holding) => holding.id);
      const { error, count } = await client
        .from("wallet_holdings")
        .delete({ count: "exact" })
        .in("id", ids);

      if (error) {
        throw new Error(
          `Failed to remove stale wallet holdings: ${error.message}`
        );
      }

      return count ?? toRemove.length;
    },

    async startSync(input: StartInventorySyncInput): Promise<WalletInventorySync> {
      const client = requireClient();
      const startedAt = input.syncStartedAt ?? new Date().toISOString();
      const { data, error } = await client
        .from("wallet_inventory_syncs")
        .insert({
          wallet_id: input.walletId,
          provider: input.provider,
          sync_status: "running",
          sync_started_at: startedAt,
          sync_completed_at: null,
          error_message: null,
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to start inventory sync: ${error.message}`);
      }

      return mapSync(data as WalletInventorySyncRow);
    },

    async completeSync(
      input: CompleteInventorySyncInput
    ): Promise<WalletInventorySync> {
      const client = requireClient();
      const completedAt = input.syncCompletedAt ?? new Date().toISOString();
      const { data, error } = await client
        .from("wallet_inventory_syncs")
        .update({
          sync_status: input.syncStatus,
          sync_completed_at: completedAt,
          error_message: input.errorMessage ?? null,
          updated_at: completedAt,
        })
        .eq("id", input.syncId)
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to complete inventory sync: ${error.message}`);
      }

      return mapSync(data as WalletInventorySyncRow);
    },

    async findLatestSync(walletId: string): Promise<WalletInventorySync | null> {
      const client = requireClient();
      const { data, error } = await client
        .from("wallet_inventory_syncs")
        .select("*")
        .eq("wallet_id", walletId)
        .order("sync_started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load latest inventory sync: ${error.message}`);
      }

      return data ? mapSync(data as WalletInventorySyncRow) : null;
    },

    async updateSyncStatus(
      syncId: string,
      syncStatus: WalletInventorySyncStatus,
      errorMessage?: string | null
    ): Promise<WalletInventorySync> {
      const client = requireClient();
      const timestamp = new Date().toISOString();
      const patch: Record<string, unknown> = {
        sync_status: syncStatus,
        error_message: errorMessage ?? null,
        updated_at: timestamp,
      };
      if (syncStatus === "success" || syncStatus === "failure") {
        patch.sync_completed_at = timestamp;
      }

      const { data, error } = await client
        .from("wallet_inventory_syncs")
        .update(patch)
        .eq("id", syncId)
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to update inventory sync status: ${error.message}`);
      }

      return mapSync(data as WalletInventorySyncRow);
    },
  };
}
