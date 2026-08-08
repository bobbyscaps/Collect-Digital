import { createClient } from "@supabase/supabase-js";

import type { CollectionDerivedSignalKey } from "@/lib/collection-signals/domain";
import type { CollectionSignalValue } from "@/lib/collection-signals/domain";
import { toCollectionSignalRunKey } from "@/lib/collection-signals/domain";
import { env } from "@/lib/env";
import type {
  CollectionSignalRepository,
  UpsertCollectionSignalValueInput,
} from "@/lib/collection-signals/repository";

interface CollectionSignalValueRow {
  id: string;
  collection_identity_id: string;
  signal_key: CollectionDerivedSignalKey;
  calculation_version: string;
  signal_run_key: string;
  numeric_value: number | null;
  structured_value: Record<string, unknown> | null;
  computed_at: string;
  source_window_start: string | null;
  source_window_end: string | null;
  completeness_status: "complete" | "partial" | "unknown";
  metadata: Record<string, unknown> | null;
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
    throw new Error("Supabase admin client unavailable for CollectionSignalRepository.");
  }
  return client;
}

function mapSignalValue(row: CollectionSignalValueRow): CollectionSignalValue {
  return {
    id: row.id,
    collectionIdentityId: row.collection_identity_id,
    signalKey: row.signal_key,
    calculationVersion: row.calculation_version,
    signalRunKey: row.signal_run_key,
    numericValue: row.numeric_value,
    structuredValue: row.structured_value,
    computedAt: row.computed_at,
    sourceWindowStart: row.source_window_start,
    sourceWindowEnd: row.source_window_end,
    completenessStatus: row.completeness_status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseCollectionSignalRepository(): CollectionSignalRepository {
  return {
    async upsertCollectionSignalValues(
      values: readonly UpsertCollectionSignalValueInput[]
    ): Promise<readonly CollectionSignalValue[]> {
      if (values.length === 0) return Object.freeze([]);
      const client = requireClient();
      const timestamp = new Date().toISOString();
      const payload = values.map((value) => ({
        collection_identity_id: value.collectionIdentityId,
        signal_key: value.signalKey,
        calculation_version: value.calculationVersion,
        signal_run_key: toCollectionSignalRunKey({
          collectionIdentityId: value.collectionIdentityId,
          signalKey: value.signalKey,
          calculationVersion: value.calculationVersion,
          computedAt: value.computedAt,
          sourceWindowStart: value.sourceWindowStart ?? null,
          sourceWindowEnd: value.sourceWindowEnd ?? null,
        }),
        numeric_value: value.numericValue ?? null,
        structured_value: value.structuredValue ?? null,
        computed_at: value.computedAt,
        source_window_start: value.sourceWindowStart ?? null,
        source_window_end: value.sourceWindowEnd ?? null,
        completeness_status: value.completenessStatus ?? "unknown",
        metadata: value.metadata ?? null,
        updated_at: timestamp,
      }));

      const { data, error } = await client
        .from("collection_signal_values")
        .upsert(payload, { onConflict: "signal_run_key" })
        .select("*");

      if (error) {
        throw new Error(`Failed to upsert collection signal values: ${error.message}`);
      }

      return Object.freeze(
        ((data as CollectionSignalValueRow[] | null) ?? []).map(mapSignalValue)
      );
    },

    async listCollectionSignalValues(
      collectionIdentityId: string,
      signalKeys?: readonly CollectionDerivedSignalKey[]
    ): Promise<readonly CollectionSignalValue[]> {
      const client = requireClient();
      let query = client
        .from("collection_signal_values")
        .select("*")
        .eq("collection_identity_id", collectionIdentityId)
        .order("signal_key", { ascending: true })
        .order("computed_at", { ascending: false })
        .order("updated_at", { ascending: false });

      if (signalKeys && signalKeys.length > 0) {
        query = query.in("signal_key", signalKeys);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to list collection signal values: ${error.message}`);
      }

      return Object.freeze(
        ((data as CollectionSignalValueRow[] | null) ?? []).map(mapSignalValue)
      );
    },

    async listLatestCollectionSignalValues(
      collectionIdentityId: string
    ): Promise<readonly CollectionSignalValue[]> {
      const rows = await this.listCollectionSignalValues(collectionIdentityId);
      const latestBySignal = new Map<CollectionDerivedSignalKey, CollectionSignalValue>();
      for (const row of rows) {
        const existing = latestBySignal.get(row.signalKey);
        if (!existing) {
          latestBySignal.set(row.signalKey, row);
          continue;
        }
        const rowMs = Date.parse(row.computedAt);
        const existingMs = Date.parse(existing.computedAt);
        if (rowMs > existingMs) {
          latestBySignal.set(row.signalKey, row);
          continue;
        }
        if (rowMs === existingMs && row.updatedAt > existing.updatedAt) {
          latestBySignal.set(row.signalKey, row);
        }
      }
      return Object.freeze(
        Array.from(latestBySignal.values()).sort((left, right) =>
          left.signalKey.localeCompare(right.signalKey)
        )
      );
    },
  };
}
