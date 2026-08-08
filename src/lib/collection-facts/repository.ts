import { randomUUID } from "node:crypto";

import type {
  CollectionAliasKind,
  CollectionFactCompletenessStatus,
  CollectionFactSyncRun,
  CollectionFactSyncStatus,
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

export interface CollectionFactProvenanceInput {
  sourceProvider: string;
  sourceEndpoint?: string | null;
  observedAt: string;
  ingestedAt?: string;
  completenessStatus?: CollectionFactCompletenessStatus;
}

export interface CollectionIdentityAliasInput {
  provider: string;
  aliasKind: CollectionAliasKind;
  aliasValue: string;
}

export interface UpsertCollectionIdentityInput {
  chainNamespace: string;
  contractAddress: string;
  aliases?: readonly CollectionIdentityAliasInput[];
}

export interface UpsertCollectionIdentityResult {
  identity: CollectionIdentity;
  aliases: readonly CollectionIdentityAlias[];
}

export interface UpsertCollectionMarketSnapshotInput
  extends CollectionFactProvenanceInput {
  collectionIdentityId: string;
  floorPriceNative?: number | null;
  topOfferNative?: number | null;
  nearFloorOfferValueNative?: number | null;
  activeOfferCount?: number | null;
  activeListingCount?: number | null;
  listedPct?: number | null;
  totalSupply?: number | null;
  holderCount?: number | null;
}

export interface UpsertCollectionSaleEventInput extends CollectionFactProvenanceInput {
  collectionIdentityId: string;
  eventId?: string;
  sourceSaleId?: string | null;
  chainNamespace: string;
  contractAddress: string;
  tokenId: string;
  transactionHash?: string | null;
  logIndex?: number | null;
  eventIndex?: number | null;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  priceCurrency?: string | null;
  priceAmountNative?: number | null;
  priceAmountUsd?: number | null;
  soldAt: string;
  marketplace?: string | null;
}

export interface UpsertCollectionTraitSnapshotInput
  extends CollectionFactProvenanceInput {
  collectionIdentityId: string;
  traitCategoryCount?: number | null;
  distinctTraitValueCount?: number | null;
  reportedSupply?: number | null;
  oneOfOneAssetCount?: number | null;
  oneOfOneSupplyPct?: number | null;
}

export interface StartCollectionFactSyncRunInput {
  sourceProvider: string;
  sourceEndpoint?: string | null;
  syncScope?: string;
  syncStartedAt?: string;
}

export interface CompleteCollectionFactSyncRunInput {
  syncRunId: string;
  syncStatus: Extract<CollectionFactSyncStatus, "success" | "failure">;
  syncCompletedAt?: string;
  errorMessage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}

export interface CollectionFactsRepository {
  upsertCollectionIdentity(
    input: UpsertCollectionIdentityInput
  ): Promise<UpsertCollectionIdentityResult>;
  listCollectionIdentityAliases(
    collectionIdentityId: string
  ): Promise<readonly CollectionIdentityAlias[]>;
  findCollectionIdentityByCanonicalId(
    canonicalId: string
  ): Promise<CollectionIdentity | null>;
  findCollectionIdentityByAlias(input: {
    provider: string;
    aliasKind: CollectionAliasKind;
    aliasValue: string;
  }): Promise<CollectionIdentity | null>;
  upsertCollectionMarketSnapshots(
    snapshots: readonly UpsertCollectionMarketSnapshotInput[]
  ): Promise<readonly CollectionMarketSnapshotFact[]>;
  listCollectionMarketSnapshots(
    collectionIdentityId: string
  ): Promise<readonly CollectionMarketSnapshotFact[]>;
  upsertCollectionSaleEvents(
    events: readonly UpsertCollectionSaleEventInput[]
  ): Promise<readonly CollectionSaleEventFact[]>;
  listCollectionSaleEvents(
    collectionIdentityId: string
  ): Promise<readonly CollectionSaleEventFact[]>;
  upsertCollectionTraitSnapshots(
    snapshots: readonly UpsertCollectionTraitSnapshotInput[]
  ): Promise<readonly CollectionTraitSnapshotFact[]>;
  listCollectionTraitSnapshots(
    collectionIdentityId: string
  ): Promise<readonly CollectionTraitSnapshotFact[]>;
  startCollectionFactSyncRun(
    input: StartCollectionFactSyncRunInput
  ): Promise<CollectionFactSyncRun>;
  completeCollectionFactSyncRun(
    input: CompleteCollectionFactSyncRunInput
  ): Promise<CollectionFactSyncRun>;
  findLatestCollectionFactSyncRun(
    sourceProvider?: string
  ): Promise<CollectionFactSyncRun | null>;
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function freezeIdentity(value: CollectionIdentity): CollectionIdentity {
  return Object.freeze({ ...value });
}

function freezeAlias(value: CollectionIdentityAlias): CollectionIdentityAlias {
  return Object.freeze({ ...value });
}

function freezeMarketSnapshot(
  value: CollectionMarketSnapshotFact
): CollectionMarketSnapshotFact {
  return Object.freeze({ ...value });
}

function freezeSaleEvent(value: CollectionSaleEventFact): CollectionSaleEventFact {
  return Object.freeze({ ...value });
}

function freezeTraitSnapshot(
  value: CollectionTraitSnapshotFact
): CollectionTraitSnapshotFact {
  return Object.freeze({ ...value });
}

function freezeSyncRun(value: CollectionFactSyncRun): CollectionFactSyncRun {
  return Object.freeze({
    ...value,
    errorMetadata: value.errorMetadata ? { ...value.errorMetadata } : null,
  });
}

function normalizeSourceProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) throw new Error("sourceProvider cannot be empty.");
  return normalized;
}

function normalizeCompletenessStatus(
  value: CollectionFactCompletenessStatus | undefined
): CollectionFactCompletenessStatus {
  return value ?? "unknown";
}

function marketSnapshotDedupKey(input: {
  collectionIdentityId: string;
  sourceProvider: string;
  observedAt: string;
}): string {
  return [
    input.collectionIdentityId,
    normalizeSourceProvider(input.sourceProvider),
    input.observedAt,
  ].join(":");
}

function traitSnapshotDedupKey(input: {
  collectionIdentityId: string;
  sourceProvider: string;
  observedAt: string;
}): string {
  return [
    input.collectionIdentityId,
    normalizeSourceProvider(input.sourceProvider),
    input.observedAt,
  ].join(":");
}

function sortByObservedAtDesc<T extends { observedAt: string }>(
  left: T,
  right: T
): number {
  if (left.observedAt === right.observedAt) return 0;
  return left.observedAt > right.observedAt ? -1 : 1;
}

function sortSalesBySoldAtDesc(
  left: CollectionSaleEventFact,
  right: CollectionSaleEventFact
): number {
  if (left.soldAt === right.soldAt) {
    return left.eventId.localeCompare(right.eventId);
  }
  return left.soldAt > right.soldAt ? -1 : 1;
}

function normalizeAliasInput(input: CollectionIdentityAliasInput): {
  provider: string;
  aliasKind: CollectionAliasKind;
  aliasValue: string;
  normalizedAliasValue: string;
} {
  const provider = normalizeSourceProvider(input.provider);
  const aliasValue = input.aliasValue.trim();
  if (!aliasValue) {
    throw new Error("aliasValue cannot be empty.");
  }
  return {
    provider,
    aliasKind: input.aliasKind,
    aliasValue,
    normalizedAliasValue: normalizeCollectionAliasValue(aliasValue),
  };
}

function buildSaleEvent(
  input: UpsertCollectionSaleEventInput,
  now: string,
  existing?: CollectionSaleEventFact
): CollectionSaleEventFact {
  const chainNamespace = normalizeCollectionChainNamespace(input.chainNamespace);
  const contractAddress = normalizeCollectionContractAddress(
    chainNamespace,
    input.contractAddress
  );
  const eventId =
    input.eventId ??
    toCollectionSaleEventId({
      chainNamespace,
      sourceProvider: input.sourceProvider,
      sourceSaleId: input.sourceSaleId ?? null,
      transactionHash: input.transactionHash ?? null,
      logIndex: input.logIndex ?? null,
      eventIndex: input.eventIndex ?? null,
      contractAddress,
      tokenId: input.tokenId,
      buyerAddress: input.buyerAddress ?? null,
      sellerAddress: input.sellerAddress ?? null,
      priceCurrency: input.priceCurrency ?? null,
      priceAmountNative: input.priceAmountNative ?? null,
      soldAt: input.soldAt,
    });

  return {
    id: existing?.id ?? randomUUID(),
    collectionIdentityId: input.collectionIdentityId,
    eventId,
    sourceSaleId: input.sourceSaleId ?? null,
    sourceProvider: normalizeSourceProvider(input.sourceProvider),
    sourceEndpoint: input.sourceEndpoint ?? null,
    observedAt: input.observedAt,
    ingestedAt: input.ingestedAt ?? now,
    completenessStatus: normalizeCompletenessStatus(input.completenessStatus),
    chainNamespace,
    contractAddress,
    tokenId: input.tokenId.trim(),
    transactionHash: input.transactionHash?.trim() || null,
    logIndex: input.logIndex ?? null,
    eventIndex: input.eventIndex ?? null,
    buyerAddress: input.buyerAddress?.trim() || null,
    sellerAddress: input.sellerAddress?.trim() || null,
    priceCurrency: input.priceCurrency?.trim() || null,
    priceAmountNative: input.priceAmountNative ?? null,
    priceAmountUsd: input.priceAmountUsd ?? null,
    soldAt: input.soldAt,
    marketplace: input.marketplace?.trim() || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createInMemoryCollectionFactsRepository(): CollectionFactsRepository {
  const identitiesById = new Map<string, CollectionIdentity>();
  const identityIdByCanonicalId = new Map<string, string>();
  const aliasesById = new Map<string, CollectionIdentityAlias>();
  const aliasIdByLookupKey = new Map<string, string>();
  const marketSnapshotsById = new Map<string, CollectionMarketSnapshotFact>();
  const marketSnapshotIdByDedupKey = new Map<string, string>();
  const saleEventsById = new Map<string, CollectionSaleEventFact>();
  const saleEventIdByEventId = new Map<string, string>();
  const traitSnapshotsById = new Map<string, CollectionTraitSnapshotFact>();
  const traitSnapshotIdByDedupKey = new Map<string, string>();
  const syncRunsById = new Map<string, CollectionFactSyncRun>();
  const syncRunIdsInCreationOrder: string[] = [];

  async function upsertAliasesForCollection(
    collectionIdentityId: string,
    aliases: readonly CollectionIdentityAliasInput[],
    timestamp: string
  ): Promise<readonly CollectionIdentityAlias[]> {
    for (const aliasInput of aliases) {
      const normalized = normalizeAliasInput(aliasInput);
      const lookupKey = toCollectionAliasLookupKey({
        provider: normalized.provider,
        aliasKind: normalized.aliasKind,
        normalizedAliasValue: normalized.normalizedAliasValue,
      });
      const existingAliasId = aliasIdByLookupKey.get(lookupKey);
      if (existingAliasId) {
        const existing = aliasesById.get(existingAliasId);
        if (!existing) {
          throw new Error(`Alias lookup index is stale for key ${lookupKey}.`);
        }
        if (existing.collectionIdentityId !== collectionIdentityId) {
          throw new Error(
            `Alias ${lookupKey} already belongs to another collection identity.`
          );
        }
        aliasesById.set(existing.id, {
          ...existing,
          aliasValue: normalized.aliasValue,
          updatedAt: timestamp,
        });
        continue;
      }

      const alias: CollectionIdentityAlias = {
        id: randomUUID(),
        collectionIdentityId,
        provider: normalized.provider,
        aliasKind: normalized.aliasKind,
        aliasValue: normalized.aliasValue,
        normalizedAliasValue: normalized.normalizedAliasValue,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      aliasesById.set(alias.id, alias);
      aliasIdByLookupKey.set(lookupKey, alias.id);
    }

    return listCollectionIdentityAliases(collectionIdentityId);
  }

  async function listCollectionIdentityAliases(
    collectionIdentityId: string
  ): Promise<readonly CollectionIdentityAlias[]> {
    const rows = Array.from(aliasesById.values())
      .filter((alias) => alias.collectionIdentityId === collectionIdentityId)
      .sort((left, right) => {
        const byProvider = left.provider.localeCompare(right.provider);
        if (byProvider !== 0) return byProvider;
        const byKind = left.aliasKind.localeCompare(right.aliasKind);
        if (byKind !== 0) return byKind;
        return left.normalizedAliasValue.localeCompare(right.normalizedAliasValue);
      })
      .map(freezeAlias);
    return Object.freeze(rows);
  }

  return {
    async upsertCollectionIdentity(
      input: UpsertCollectionIdentityInput
    ): Promise<UpsertCollectionIdentityResult> {
      const chainNamespace = normalizeCollectionChainNamespace(input.chainNamespace);
      const contractAddress = normalizeCollectionContractAddress(
        chainNamespace,
        input.contractAddress
      );
      const canonicalId = toCollectionCanonicalId(chainNamespace, contractAddress);
      const timestamp = nowIso();
      const existingId = identityIdByCanonicalId.get(canonicalId);
      const existing = existingId ? identitiesById.get(existingId) : undefined;
      const identity: CollectionIdentity = existing
        ? {
            ...existing,
            updatedAt: timestamp,
          }
        : {
            id: randomUUID(),
            chainNamespace,
            contractAddress,
            canonicalId,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      identitiesById.set(identity.id, identity);
      identityIdByCanonicalId.set(canonicalId, identity.id);

      const aliases = await upsertAliasesForCollection(
        identity.id,
        input.aliases ?? [],
        timestamp
      );
      return {
        identity: freezeIdentity(identity),
        aliases,
      };
    },

    listCollectionIdentityAliases,

    async findCollectionIdentityByCanonicalId(
      canonicalId: string
    ): Promise<CollectionIdentity | null> {
      const normalizedCanonicalId = canonicalId.trim().toLowerCase();
      if (!normalizedCanonicalId) return null;
      const id = identityIdByCanonicalId.get(normalizedCanonicalId);
      if (!id) return null;
      const identity = identitiesById.get(id);
      return identity ? freezeIdentity(identity) : null;
    },

    async findCollectionIdentityByAlias(input: {
      provider: string;
      aliasKind: CollectionAliasKind;
      aliasValue: string;
    }): Promise<CollectionIdentity | null> {
      const lookupKey = toCollectionAliasLookupKey({
        provider: normalizeSourceProvider(input.provider),
        aliasKind: input.aliasKind,
        normalizedAliasValue: normalizeCollectionAliasValue(input.aliasValue),
      });
      const aliasId = aliasIdByLookupKey.get(lookupKey);
      if (!aliasId) return null;
      const alias = aliasesById.get(aliasId);
      if (!alias) return null;
      const identity = identitiesById.get(alias.collectionIdentityId);
      return identity ? freezeIdentity(identity) : null;
    },

    async upsertCollectionMarketSnapshots(
      snapshots: readonly UpsertCollectionMarketSnapshotInput[]
    ): Promise<readonly CollectionMarketSnapshotFact[]> {
      if (snapshots.length === 0) return Object.freeze([]);
      const timestamp = nowIso();
      const rows: CollectionMarketSnapshotFact[] = [];
      for (const snapshot of snapshots) {
        const key = marketSnapshotDedupKey({
          collectionIdentityId: snapshot.collectionIdentityId,
          sourceProvider: snapshot.sourceProvider,
          observedAt: snapshot.observedAt,
        });
        const existingId = marketSnapshotIdByDedupKey.get(key);
        const existing = existingId ? marketSnapshotsById.get(existingId) : undefined;
        const row: CollectionMarketSnapshotFact = {
          id: existing?.id ?? randomUUID(),
          collectionIdentityId: snapshot.collectionIdentityId,
          sourceProvider: normalizeSourceProvider(snapshot.sourceProvider),
          sourceEndpoint: snapshot.sourceEndpoint ?? null,
          observedAt: snapshot.observedAt,
          ingestedAt: snapshot.ingestedAt ?? timestamp,
          completenessStatus: normalizeCompletenessStatus(
            snapshot.completenessStatus
          ),
          floorPriceNative: snapshot.floorPriceNative ?? null,
          topOfferNative: snapshot.topOfferNative ?? null,
          nearFloorOfferValueNative: snapshot.nearFloorOfferValueNative ?? null,
          activeOfferCount: snapshot.activeOfferCount ?? null,
          activeListingCount: snapshot.activeListingCount ?? null,
          listedPct: snapshot.listedPct ?? null,
          totalSupply: snapshot.totalSupply ?? null,
          holderCount: snapshot.holderCount ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };

        marketSnapshotsById.set(row.id, row);
        marketSnapshotIdByDedupKey.set(key, row.id);
        rows.push(freezeMarketSnapshot(row));
      }
      return Object.freeze(rows);
    },

    async listCollectionMarketSnapshots(
      collectionIdentityId: string
    ): Promise<readonly CollectionMarketSnapshotFact[]> {
      return Object.freeze(
        Array.from(marketSnapshotsById.values())
          .filter((row) => row.collectionIdentityId === collectionIdentityId)
          .sort(sortByObservedAtDesc)
          .map(freezeMarketSnapshot)
      );
    },

    async upsertCollectionSaleEvents(
      events: readonly UpsertCollectionSaleEventInput[]
    ): Promise<readonly CollectionSaleEventFact[]> {
      if (events.length === 0) return Object.freeze([]);
      const timestamp = nowIso();
      const rows: CollectionSaleEventFact[] = [];

      for (const eventInput of events) {
        const provisional = buildSaleEvent(eventInput, timestamp);
        const existingId = saleEventIdByEventId.get(provisional.eventId);
        const existing = existingId ? saleEventsById.get(existingId) : undefined;
        const row = buildSaleEvent(eventInput, timestamp, existing);
        saleEventsById.set(row.id, row);
        saleEventIdByEventId.set(row.eventId, row.id);
        rows.push(freezeSaleEvent(row));
      }

      return Object.freeze(rows);
    },

    async listCollectionSaleEvents(
      collectionIdentityId: string
    ): Promise<readonly CollectionSaleEventFact[]> {
      return Object.freeze(
        Array.from(saleEventsById.values())
          .filter((row) => row.collectionIdentityId === collectionIdentityId)
          .sort(sortSalesBySoldAtDesc)
          .map(freezeSaleEvent)
      );
    },

    async upsertCollectionTraitSnapshots(
      snapshots: readonly UpsertCollectionTraitSnapshotInput[]
    ): Promise<readonly CollectionTraitSnapshotFact[]> {
      if (snapshots.length === 0) return Object.freeze([]);
      const timestamp = nowIso();
      const rows: CollectionTraitSnapshotFact[] = [];

      for (const snapshot of snapshots) {
        const key = traitSnapshotDedupKey({
          collectionIdentityId: snapshot.collectionIdentityId,
          sourceProvider: snapshot.sourceProvider,
          observedAt: snapshot.observedAt,
        });
        const existingId = traitSnapshotIdByDedupKey.get(key);
        const existing = existingId ? traitSnapshotsById.get(existingId) : undefined;

        const row: CollectionTraitSnapshotFact = {
          id: existing?.id ?? randomUUID(),
          collectionIdentityId: snapshot.collectionIdentityId,
          sourceProvider: normalizeSourceProvider(snapshot.sourceProvider),
          sourceEndpoint: snapshot.sourceEndpoint ?? null,
          observedAt: snapshot.observedAt,
          ingestedAt: snapshot.ingestedAt ?? timestamp,
          completenessStatus: normalizeCompletenessStatus(
            snapshot.completenessStatus
          ),
          traitCategoryCount: snapshot.traitCategoryCount ?? null,
          distinctTraitValueCount: snapshot.distinctTraitValueCount ?? null,
          reportedSupply: snapshot.reportedSupply ?? null,
          oneOfOneAssetCount: snapshot.oneOfOneAssetCount ?? null,
          oneOfOneSupplyPct: snapshot.oneOfOneSupplyPct ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };

        traitSnapshotsById.set(row.id, row);
        traitSnapshotIdByDedupKey.set(key, row.id);
        rows.push(freezeTraitSnapshot(row));
      }

      return Object.freeze(rows);
    },

    async listCollectionTraitSnapshots(
      collectionIdentityId: string
    ): Promise<readonly CollectionTraitSnapshotFact[]> {
      return Object.freeze(
        Array.from(traitSnapshotsById.values())
          .filter((row) => row.collectionIdentityId === collectionIdentityId)
          .sort(sortByObservedAtDesc)
          .map(freezeTraitSnapshot)
      );
    },

    async startCollectionFactSyncRun(
      input: StartCollectionFactSyncRunInput
    ): Promise<CollectionFactSyncRun> {
      const timestamp = input.syncStartedAt ?? nowIso();
      const syncRun: CollectionFactSyncRun = {
        id: randomUUID(),
        sourceProvider: normalizeSourceProvider(input.sourceProvider),
        sourceEndpoint: input.sourceEndpoint ?? null,
        syncScope: input.syncScope ?? "collection_facts",
        syncStatus: "running",
        syncStartedAt: timestamp,
        syncCompletedAt: null,
        durationMs: null,
        errorMessage: null,
        errorMetadata: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      syncRunsById.set(syncRun.id, syncRun);
      syncRunIdsInCreationOrder.push(syncRun.id);
      return freezeSyncRun(syncRun);
    },

    async completeCollectionFactSyncRun(
      input: CompleteCollectionFactSyncRunInput
    ): Promise<CollectionFactSyncRun> {
      const existing = syncRunsById.get(input.syncRunId);
      if (!existing) {
        throw new Error(`Collection fact sync run not found: ${input.syncRunId}`);
      }
      const completedAt = input.syncCompletedAt ?? nowIso();
      const updated: CollectionFactSyncRun = {
        ...existing,
        syncStatus: input.syncStatus,
        syncCompletedAt: completedAt,
        durationMs: computeCollectionFactSyncDurationMs(
          existing.syncStartedAt,
          completedAt
        ),
        errorMessage: input.errorMessage ?? null,
        errorMetadata: input.errorMetadata ?? null,
        updatedAt: completedAt,
      };
      syncRunsById.set(updated.id, updated);
      return freezeSyncRun(updated);
    },

    async findLatestCollectionFactSyncRun(
      sourceProvider?: string
    ): Promise<CollectionFactSyncRun | null> {
      const normalizedProvider = sourceProvider
        ? normalizeSourceProvider(sourceProvider)
        : null;

      for (let index = syncRunIdsInCreationOrder.length - 1; index >= 0; index -= 1) {
        const run = syncRunsById.get(syncRunIdsInCreationOrder[index]);
        if (!run) continue;
        if (normalizedProvider && run.sourceProvider !== normalizedProvider) continue;
        return freezeSyncRun(run);
      }

      return null;
    },
  };
}
