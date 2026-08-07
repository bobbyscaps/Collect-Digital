import { createClient } from "@supabase/supabase-js";

import type {
  CollectionAliasKind,
  CollectionFactSyncRun,
  CollectionIdentity,
  CollectionIdentityAlias,
  CollectionMarketSnapshotFact,
  CollectionSaleEventFact,
  CollectionTraitSnapshotFact,
} from "@/lib/collection-facts/domain";
import {
  computeCollectionFactSyncDurationMs,
  normalizeCollectionAliasValue,
  normalizeCollectionChainNamespace,
  normalizeCollectionContractAddress,
  toCollectionAliasLookupKey,
  toCollectionCanonicalId,
  toCollectionSaleEventId,
} from "@/lib/collection-facts/domain";
import { env } from "@/lib/env";
import type {
  CollectionFactsRepository,
  CompleteCollectionFactSyncRunInput,
  StartCollectionFactSyncRunInput,
  UpsertCollectionIdentityInput,
  UpsertCollectionIdentityResult,
  UpsertCollectionMarketSnapshotInput,
  UpsertCollectionSaleEventInput,
  UpsertCollectionTraitSnapshotInput,
} from "@/lib/collection-facts/repository";

interface CollectionIdentityRow {
  id: string;
  chain_namespace: string;
  contract_address: string;
  canonical_id: string;
  created_at: string;
  updated_at: string;
}

interface CollectionIdentityAliasRow {
  id: string;
  collection_identity_id: string;
  provider: string;
  alias_kind: CollectionAliasKind;
  alias_value: string;
  normalized_alias_value: string;
  created_at: string;
  updated_at: string;
}

interface CollectionMarketSnapshotRow {
  id: string;
  collection_identity_id: string;
  source_provider: string;
  source_endpoint: string | null;
  observed_at: string;
  ingested_at: string;
  completeness_status: "complete" | "partial" | "unknown";
  floor_price_native: number | null;
  top_offer_native: number | null;
  near_floor_offer_value_native: number | null;
  active_offer_count: number | null;
  active_listing_count: number | null;
  listed_pct: number | null;
  total_supply: number | null;
  holder_count: number | null;
  created_at: string;
  updated_at: string;
}

interface CollectionSaleEventRow {
  id: string;
  collection_identity_id: string;
  event_id: string;
  source_sale_id: string | null;
  source_provider: string;
  source_endpoint: string | null;
  observed_at: string;
  ingested_at: string;
  completeness_status: "complete" | "partial" | "unknown";
  chain_namespace: string;
  contract_address: string;
  token_id: string;
  transaction_hash: string | null;
  log_index: number | null;
  event_index: number | null;
  buyer_address: string | null;
  seller_address: string | null;
  price_currency: string | null;
  price_amount_native: number | null;
  price_amount_usd: number | null;
  sold_at: string;
  marketplace: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionTraitSnapshotRow {
  id: string;
  collection_identity_id: string;
  source_provider: string;
  source_endpoint: string | null;
  observed_at: string;
  ingested_at: string;
  completeness_status: "complete" | "partial" | "unknown";
  trait_category_count: number | null;
  distinct_trait_value_count: number | null;
  reported_supply: number | null;
  one_of_one_asset_count: number | null;
  one_of_one_supply_pct: number | null;
  created_at: string;
  updated_at: string;
}

interface CollectionFactSyncRunRow {
  id: string;
  source_provider: string;
  source_endpoint: string | null;
  sync_scope: string;
  sync_status: "running" | "success" | "failure";
  sync_started_at: string;
  sync_completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_metadata: Record<string, unknown> | null;
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
    throw new Error("Supabase admin client unavailable for CollectionFactsRepository.");
  }
  return client;
}

function mapCollectionIdentity(row: CollectionIdentityRow): CollectionIdentity {
  return {
    id: row.id,
    chainNamespace: row.chain_namespace,
    contractAddress: row.contract_address,
    canonicalId: row.canonical_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCollectionIdentityAlias(
  row: CollectionIdentityAliasRow
): CollectionIdentityAlias {
  return {
    id: row.id,
    collectionIdentityId: row.collection_identity_id,
    provider: row.provider,
    aliasKind: row.alias_kind,
    aliasValue: row.alias_value,
    normalizedAliasValue: row.normalized_alias_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMarketSnapshot(
  row: CollectionMarketSnapshotRow
): CollectionMarketSnapshotFact {
  return {
    id: row.id,
    collectionIdentityId: row.collection_identity_id,
    sourceProvider: row.source_provider,
    sourceEndpoint: row.source_endpoint,
    observedAt: row.observed_at,
    ingestedAt: row.ingested_at,
    completenessStatus: row.completeness_status,
    floorPriceNative: row.floor_price_native,
    topOfferNative: row.top_offer_native,
    nearFloorOfferValueNative: row.near_floor_offer_value_native,
    activeOfferCount: row.active_offer_count,
    activeListingCount: row.active_listing_count,
    listedPct: row.listed_pct,
    totalSupply: row.total_supply,
    holderCount: row.holder_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSaleEvent(row: CollectionSaleEventRow): CollectionSaleEventFact {
  return {
    id: row.id,
    collectionIdentityId: row.collection_identity_id,
    eventId: row.event_id,
    sourceSaleId: row.source_sale_id,
    sourceProvider: row.source_provider,
    sourceEndpoint: row.source_endpoint,
    observedAt: row.observed_at,
    ingestedAt: row.ingested_at,
    completenessStatus: row.completeness_status,
    chainNamespace: row.chain_namespace,
    contractAddress: row.contract_address,
    tokenId: row.token_id,
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    eventIndex: row.event_index,
    buyerAddress: row.buyer_address,
    sellerAddress: row.seller_address,
    priceCurrency: row.price_currency,
    priceAmountNative: row.price_amount_native,
    priceAmountUsd: row.price_amount_usd,
    soldAt: row.sold_at,
    marketplace: row.marketplace,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTraitSnapshot(
  row: CollectionTraitSnapshotRow
): CollectionTraitSnapshotFact {
  return {
    id: row.id,
    collectionIdentityId: row.collection_identity_id,
    sourceProvider: row.source_provider,
    sourceEndpoint: row.source_endpoint,
    observedAt: row.observed_at,
    ingestedAt: row.ingested_at,
    completenessStatus: row.completeness_status,
    traitCategoryCount: row.trait_category_count,
    distinctTraitValueCount: row.distinct_trait_value_count,
    reportedSupply: row.reported_supply,
    oneOfOneAssetCount: row.one_of_one_asset_count,
    oneOfOneSupplyPct: row.one_of_one_supply_pct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncRun(row: CollectionFactSyncRunRow): CollectionFactSyncRun {
  return {
    id: row.id,
    sourceProvider: row.source_provider,
    sourceEndpoint: row.source_endpoint,
    syncScope: row.sync_scope,
    syncStatus: row.sync_status,
    syncStartedAt: row.sync_started_at,
    syncCompletedAt: row.sync_completed_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    errorMetadata: row.error_metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSourceProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) throw new Error("sourceProvider cannot be empty.");
  return normalized;
}

function normalizeAliasInput(input: {
  provider: string;
  aliasKind: CollectionAliasKind;
  aliasValue: string;
}) {
  const provider = normalizeSourceProvider(input.provider);
  const aliasValue = input.aliasValue.trim();
  if (!aliasValue) {
    throw new Error("aliasValue cannot be empty.");
  }
  const normalizedAliasValue = normalizeCollectionAliasValue(aliasValue);
  return {
    provider,
    aliasKind: input.aliasKind,
    aliasValue,
    normalizedAliasValue,
  };
}

export function createSupabaseCollectionFactsRepository(): CollectionFactsRepository {
  return {
    async upsertCollectionIdentity(
      input: UpsertCollectionIdentityInput
    ): Promise<UpsertCollectionIdentityResult> {
      const client = requireClient();
      const chainNamespace = normalizeCollectionChainNamespace(input.chainNamespace);
      const contractAddress = normalizeCollectionContractAddress(
        chainNamespace,
        input.contractAddress
      );
      const canonicalId = toCollectionCanonicalId(chainNamespace, contractAddress);
      const timestamp = new Date().toISOString();

      const { data: identityRow, error: identityError } = await client
        .from("collection_identities")
        .upsert(
          {
            chain_namespace: chainNamespace,
            contract_address: contractAddress,
            canonical_id: canonicalId,
            updated_at: timestamp,
          },
          { onConflict: "canonical_id" }
        )
        .select("*")
        .single();

      if (identityError || !identityRow) {
        throw new Error(
          `Failed to upsert collection identity: ${identityError?.message ?? "unknown error"}`
        );
      }

      const collectionIdentity = mapCollectionIdentity(
        identityRow as CollectionIdentityRow
      );

      for (const aliasInput of input.aliases ?? []) {
        const alias = normalizeAliasInput(aliasInput);
        const lookupKey = toCollectionAliasLookupKey({
          provider: alias.provider,
          aliasKind: alias.aliasKind,
          normalizedAliasValue: alias.normalizedAliasValue,
        });

        const { data: existingAlias, error: existingAliasError } = await client
          .from("collection_identity_aliases")
          .select("*")
          .eq("provider", alias.provider)
          .eq("alias_kind", alias.aliasKind)
          .eq("normalized_alias_value", alias.normalizedAliasValue)
          .maybeSingle();

        if (existingAliasError) {
          throw new Error(
            `Failed to lookup collection alias ${lookupKey}: ${existingAliasError.message}`
          );
        }
        if (
          existingAlias &&
          (existingAlias as CollectionIdentityAliasRow).collection_identity_id !==
            collectionIdentity.id
        ) {
          throw new Error(
            `Collection alias ${lookupKey} already belongs to another collection identity.`
          );
        }

        const { error: aliasUpsertError } = await client
          .from("collection_identity_aliases")
          .upsert(
            {
              collection_identity_id: collectionIdentity.id,
              provider: alias.provider,
              alias_kind: alias.aliasKind,
              alias_value: alias.aliasValue,
              normalized_alias_value: alias.normalizedAliasValue,
              updated_at: timestamp,
            },
            { onConflict: "provider,alias_kind,normalized_alias_value" }
          );

        if (aliasUpsertError) {
          throw new Error(
            `Failed to upsert collection alias ${lookupKey}: ${aliasUpsertError.message}`
          );
        }
      }

      const aliases = await this.listCollectionIdentityAliases(collectionIdentity.id);
      return {
        identity: collectionIdentity,
        aliases,
      };
    },

    async listCollectionIdentityAliases(
      collectionIdentityId: string
    ): Promise<readonly CollectionIdentityAlias[]> {
      const client = requireClient();
      const { data, error } = await client
        .from("collection_identity_aliases")
        .select("*")
        .eq("collection_identity_id", collectionIdentityId)
        .order("provider", { ascending: true })
        .order("alias_kind", { ascending: true })
        .order("normalized_alias_value", { ascending: true });

      if (error) {
        throw new Error(`Failed to list collection aliases: ${error.message}`);
      }

      return Object.freeze(
        ((data as CollectionIdentityAliasRow[] | null) ?? []).map(
          mapCollectionIdentityAlias
        )
      );
    },

    async findCollectionIdentityByCanonicalId(
      canonicalId: string
    ): Promise<CollectionIdentity | null> {
      const client = requireClient();
      const normalizedCanonicalId = canonicalId.trim().toLowerCase();
      if (!normalizedCanonicalId) return null;
      const { data, error } = await client
        .from("collection_identities")
        .select("*")
        .eq("canonical_id", normalizedCanonicalId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to load collection identity by canonical id: ${error.message}`
        );
      }
      return data ? mapCollectionIdentity(data as CollectionIdentityRow) : null;
    },

    async findCollectionIdentityByAlias(input: {
      provider: string;
      aliasKind: CollectionAliasKind;
      aliasValue: string;
    }): Promise<CollectionIdentity | null> {
      const client = requireClient();
      const alias = normalizeAliasInput(input);

      const { data: aliasRow, error: aliasError } = await client
        .from("collection_identity_aliases")
        .select("collection_identity_id")
        .eq("provider", alias.provider)
        .eq("alias_kind", alias.aliasKind)
        .eq("normalized_alias_value", alias.normalizedAliasValue)
        .maybeSingle();

      if (aliasError) {
        throw new Error(`Failed to resolve collection alias: ${aliasError.message}`);
      }
      if (!aliasRow) return null;

      const { data: identityRow, error: identityError } = await client
        .from("collection_identities")
        .select("*")
        .eq(
          "id",
          (aliasRow as { collection_identity_id: string }).collection_identity_id
        )
        .maybeSingle();

      if (identityError) {
        throw new Error(
          `Failed to load collection identity by alias: ${identityError.message}`
        );
      }
      return identityRow ? mapCollectionIdentity(identityRow as CollectionIdentityRow) : null;
    },

    async upsertCollectionMarketSnapshots(
      snapshots: readonly UpsertCollectionMarketSnapshotInput[]
    ): Promise<readonly CollectionMarketSnapshotFact[]> {
      if (snapshots.length === 0) return Object.freeze([]);
      const client = requireClient();
      const timestamp = new Date().toISOString();
      const payload = snapshots.map((snapshot) => ({
        collection_identity_id: snapshot.collectionIdentityId,
        source_provider: normalizeSourceProvider(snapshot.sourceProvider),
        source_endpoint: snapshot.sourceEndpoint ?? null,
        observed_at: snapshot.observedAt,
        ingested_at: snapshot.ingestedAt ?? timestamp,
        completeness_status: snapshot.completenessStatus ?? "unknown",
        floor_price_native: snapshot.floorPriceNative ?? null,
        top_offer_native: snapshot.topOfferNative ?? null,
        near_floor_offer_value_native: snapshot.nearFloorOfferValueNative ?? null,
        active_offer_count: snapshot.activeOfferCount ?? null,
        active_listing_count: snapshot.activeListingCount ?? null,
        listed_pct: snapshot.listedPct ?? null,
        total_supply: snapshot.totalSupply ?? null,
        holder_count: snapshot.holderCount ?? null,
        updated_at: timestamp,
      }));

      const { data, error } = await client
        .from("collection_market_snapshots")
        .upsert(payload, {
          onConflict: "collection_identity_id,source_provider,observed_at",
        })
        .select("*");

      if (error) {
        throw new Error(`Failed to upsert market snapshots: ${error.message}`);
      }
      return Object.freeze(
        ((data as CollectionMarketSnapshotRow[] | null) ?? []).map(mapMarketSnapshot)
      );
    },

    async listCollectionMarketSnapshots(
      collectionIdentityId: string
    ): Promise<readonly CollectionMarketSnapshotFact[]> {
      const client = requireClient();
      const { data, error } = await client
        .from("collection_market_snapshots")
        .select("*")
        .eq("collection_identity_id", collectionIdentityId)
        .order("observed_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to list market snapshots: ${error.message}`);
      }
      return Object.freeze(
        ((data as CollectionMarketSnapshotRow[] | null) ?? []).map(mapMarketSnapshot)
      );
    },

    async upsertCollectionSaleEvents(
      events: readonly UpsertCollectionSaleEventInput[]
    ): Promise<readonly CollectionSaleEventFact[]> {
      if (events.length === 0) return Object.freeze([]);
      const client = requireClient();
      const timestamp = new Date().toISOString();

      const payload = events.map((event) => {
        const chainNamespace = normalizeCollectionChainNamespace(event.chainNamespace);
        const contractAddress = normalizeCollectionContractAddress(
          chainNamespace,
          event.contractAddress
        );
        const eventId =
          event.eventId ??
          toCollectionSaleEventId({
            chainNamespace,
            sourceProvider: event.sourceProvider,
            sourceSaleId: event.sourceSaleId ?? null,
            transactionHash: event.transactionHash ?? null,
            logIndex: event.logIndex ?? null,
            eventIndex: event.eventIndex ?? null,
            contractAddress,
            tokenId: event.tokenId,
            buyerAddress: event.buyerAddress ?? null,
            sellerAddress: event.sellerAddress ?? null,
            priceCurrency: event.priceCurrency ?? null,
            priceAmountNative: event.priceAmountNative ?? null,
            soldAt: event.soldAt,
          });

        return {
          collection_identity_id: event.collectionIdentityId,
          event_id: eventId,
          source_sale_id: event.sourceSaleId ?? null,
          source_provider: normalizeSourceProvider(event.sourceProvider),
          source_endpoint: event.sourceEndpoint ?? null,
          observed_at: event.observedAt,
          ingested_at: event.ingestedAt ?? timestamp,
          completeness_status: event.completenessStatus ?? "unknown",
          chain_namespace: chainNamespace,
          contract_address: contractAddress,
          token_id: event.tokenId.trim(),
          transaction_hash: event.transactionHash?.trim() || null,
          log_index: event.logIndex ?? null,
          event_index: event.eventIndex ?? null,
          buyer_address: event.buyerAddress?.trim() || null,
          seller_address: event.sellerAddress?.trim() || null,
          price_currency: event.priceCurrency?.trim() || null,
          price_amount_native: event.priceAmountNative ?? null,
          price_amount_usd: event.priceAmountUsd ?? null,
          sold_at: event.soldAt,
          marketplace: event.marketplace?.trim() || null,
          updated_at: timestamp,
        };
      });

      const { data, error } = await client
        .from("collection_sales_events")
        .upsert(payload, { onConflict: "event_id" })
        .select("*");

      if (error) {
        throw new Error(`Failed to upsert sale events: ${error.message}`);
      }

      return Object.freeze(
        ((data as CollectionSaleEventRow[] | null) ?? []).map(mapSaleEvent)
      );
    },

    async listCollectionSaleEvents(
      collectionIdentityId: string
    ): Promise<readonly CollectionSaleEventFact[]> {
      const client = requireClient();
      const { data, error } = await client
        .from("collection_sales_events")
        .select("*")
        .eq("collection_identity_id", collectionIdentityId)
        .order("sold_at", { ascending: false })
        .order("event_id", { ascending: true });

      if (error) {
        throw new Error(`Failed to list sale events: ${error.message}`);
      }
      return Object.freeze(
        ((data as CollectionSaleEventRow[] | null) ?? []).map(mapSaleEvent)
      );
    },

    async upsertCollectionTraitSnapshots(
      snapshots: readonly UpsertCollectionTraitSnapshotInput[]
    ): Promise<readonly CollectionTraitSnapshotFact[]> {
      if (snapshots.length === 0) return Object.freeze([]);
      const client = requireClient();
      const timestamp = new Date().toISOString();
      const payload = snapshots.map((snapshot) => ({
        collection_identity_id: snapshot.collectionIdentityId,
        source_provider: normalizeSourceProvider(snapshot.sourceProvider),
        source_endpoint: snapshot.sourceEndpoint ?? null,
        observed_at: snapshot.observedAt,
        ingested_at: snapshot.ingestedAt ?? timestamp,
        completeness_status: snapshot.completenessStatus ?? "unknown",
        trait_category_count: snapshot.traitCategoryCount ?? null,
        distinct_trait_value_count: snapshot.distinctTraitValueCount ?? null,
        reported_supply: snapshot.reportedSupply ?? null,
        one_of_one_asset_count: snapshot.oneOfOneAssetCount ?? null,
        one_of_one_supply_pct: snapshot.oneOfOneSupplyPct ?? null,
        updated_at: timestamp,
      }));

      const { data, error } = await client
        .from("collection_trait_snapshots")
        .upsert(payload, {
          onConflict: "collection_identity_id,source_provider,observed_at",
        })
        .select("*");

      if (error) {
        throw new Error(`Failed to upsert trait snapshots: ${error.message}`);
      }
      return Object.freeze(
        ((data as CollectionTraitSnapshotRow[] | null) ?? []).map(mapTraitSnapshot)
      );
    },

    async listCollectionTraitSnapshots(
      collectionIdentityId: string
    ): Promise<readonly CollectionTraitSnapshotFact[]> {
      const client = requireClient();
      const { data, error } = await client
        .from("collection_trait_snapshots")
        .select("*")
        .eq("collection_identity_id", collectionIdentityId)
        .order("observed_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to list trait snapshots: ${error.message}`);
      }
      return Object.freeze(
        ((data as CollectionTraitSnapshotRow[] | null) ?? []).map(mapTraitSnapshot)
      );
    },

    async startCollectionFactSyncRun(
      input: StartCollectionFactSyncRunInput
    ): Promise<CollectionFactSyncRun> {
      const client = requireClient();
      const startedAt = input.syncStartedAt ?? new Date().toISOString();
      const { data, error } = await client
        .from("collection_fact_sync_runs")
        .insert({
          source_provider: normalizeSourceProvider(input.sourceProvider),
          source_endpoint: input.sourceEndpoint ?? null,
          sync_scope: input.syncScope ?? "collection_facts",
          sync_status: "running",
          sync_started_at: startedAt,
          sync_completed_at: null,
          duration_ms: null,
          error_message: null,
          error_metadata: null,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(
          `Failed to start collection fact sync run: ${error?.message ?? "unknown error"}`
        );
      }
      return mapSyncRun(data as CollectionFactSyncRunRow);
    },

    async completeCollectionFactSyncRun(
      input: CompleteCollectionFactSyncRunInput
    ): Promise<CollectionFactSyncRun> {
      const client = requireClient();
      const completedAt = input.syncCompletedAt ?? new Date().toISOString();

      const { data: existing, error: existingError } = await client
        .from("collection_fact_sync_runs")
        .select("sync_started_at")
        .eq("id", input.syncRunId)
        .single();

      if (existingError || !existing) {
        throw new Error(
          `Failed to load collection fact sync run: ${existingError?.message ?? "not found"}`
        );
      }

      const durationMs = computeCollectionFactSyncDurationMs(
        (existing as { sync_started_at: string }).sync_started_at,
        completedAt
      );

      const { data, error } = await client
        .from("collection_fact_sync_runs")
        .update({
          sync_status: input.syncStatus,
          sync_completed_at: completedAt,
          duration_ms: durationMs,
          error_message: input.errorMessage ?? null,
          error_metadata: input.errorMetadata ?? null,
          updated_at: completedAt,
        })
        .eq("id", input.syncRunId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(
          `Failed to complete collection fact sync run: ${error?.message ?? "unknown error"}`
        );
      }
      return mapSyncRun(data as CollectionFactSyncRunRow);
    },

    async findLatestCollectionFactSyncRun(
      sourceProvider?: string
    ): Promise<CollectionFactSyncRun | null> {
      const client = requireClient();
      let query = client
        .from("collection_fact_sync_runs")
        .select("*")
        .order("sync_started_at", { ascending: false })
        .limit(1);

      if (sourceProvider) {
        query = query.eq("source_provider", normalizeSourceProvider(sourceProvider));
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error(
          `Failed to load latest collection fact sync run: ${error.message}`
        );
      }
      return data ? mapSyncRun(data as CollectionFactSyncRunRow) : null;
    },
  };
}
