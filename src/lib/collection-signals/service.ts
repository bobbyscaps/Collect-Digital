import type {
  CollectionFactCompletenessStatus,
  CollectionMarketSnapshotFact,
  CollectionSaleEventFact,
  CollectionTraitSnapshotFact,
} from "@/lib/collection-facts/domain";
import type { CollectionFactsRepository } from "@/lib/collection-facts/repository";
import {
  COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS,
  COLLECTION_DERIVED_SIGNAL_KEYS,
  type CollectionDerivedSignalKey,
  type CollectionSignalSourceWindow,
  type CollectionSignalValue,
  toIsoDateFromMs,
} from "@/lib/collection-signals/domain";
import type {
  CollectionSignalRepository,
  UpsertCollectionSignalValueInput,
} from "@/lib/collection-signals/repository";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const LISTING_PRESSURE_DISCREPANCY_PCT = 0.5;

export interface ComputeCollectionSignalInput {
  collectionIdentityId: string;
  signalKey: CollectionDerivedSignalKey;
  evaluatedAt?: string;
}

export interface ComputeCollectionSignalBatchInput {
  collectionIdentityId: string;
  evaluatedAt?: string;
}

export interface CollectionSignalService {
  computeCollectionSignal(
    input: ComputeCollectionSignalInput
  ): Promise<CollectionSignalValue>;
  computeMvpCollectionSignalBatch(
    input: ComputeCollectionSignalBatchInput
  ): Promise<readonly CollectionSignalValue[]>;
  listLatestCollectionSignals(
    collectionIdentityId: string
  ): Promise<readonly CollectionSignalValue[]>;
}

interface SignalComputationResult {
  signalKey: CollectionDerivedSignalKey;
  calculationVersion: string;
  numericValue: number | null;
  structuredValue: Record<string, unknown> | null;
  sourceWindow: CollectionSignalSourceWindow;
  completenessStatus: CollectionFactCompletenessStatus;
  metadata: Record<string, unknown> | null;
}

interface LoadedFactContext {
  evaluatedAt: string;
  evaluatedAtMs: number;
  marketSnapshots: readonly CollectionMarketSnapshotFact[];
  traitSnapshots: readonly CollectionTraitSnapshotFact[];
  salesEvents: readonly CollectionSaleEventFact[];
}

function toEvaluatedAtIso(evaluatedAt: string | undefined, now: () => Date): string {
  const iso = evaluatedAt ?? now().toISOString();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid evaluatedAt timestamp: ${iso}`);
  }
  return new Date(ms).toISOString();
}

function toBoundedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toBoundedDensity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pickLatestObservedFact<T extends { observedAt: string }>(
  values: readonly T[],
  evaluatedAtMs: number
): T | null {
  let latest: T | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const observedAtMs = Date.parse(value.observedAt);
    if (!Number.isFinite(observedAtMs)) continue;
    if (observedAtMs > evaluatedAtMs) continue;
    if (observedAtMs > latestMs) {
      latest = value;
      latestMs = observedAtMs;
    }
  }
  return latest;
}

function toThirtyDayWindow(evaluatedAtMs: number): CollectionSignalSourceWindow {
  return {
    windowStart: toIsoDateFromMs(evaluatedAtMs - THIRTY_DAYS_MS),
    windowEnd: toIsoDateFromMs(evaluatedAtMs),
  };
}

function filterSalesInWindow(input: {
  salesEvents: readonly CollectionSaleEventFact[];
  windowStartMs: number;
  windowEndMs: number;
}): {
  inWindow: CollectionSaleEventFact[];
  qualifying: CollectionSaleEventFact[];
  droppedMissingPriceCount: number;
} {
  const inWindow = input.salesEvents.filter((sale) => {
    const soldAtMs = Date.parse(sale.soldAt);
    if (!Number.isFinite(soldAtMs)) return false;
    return soldAtMs >= input.windowStartMs && soldAtMs <= input.windowEndMs;
  });
  const qualifying = inWindow.filter((sale) => {
    const value = sale.priceAmountNative;
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
  return {
    inWindow,
    qualifying,
    droppedMissingPriceCount: inWindow.length - qualifying.length,
  };
}

function buildNearFloorBidLiquiditySignal(
  context: LoadedFactContext
): SignalComputationResult {
  const snapshot = pickLatestObservedFact(
    context.marketSnapshots,
    context.evaluatedAtMs
  );
  if (!snapshot) {
    return {
      signalKey: "near_floor_bid_liquidity",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.near_floor_bid_liquidity,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: null,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "no_market_snapshot",
      },
    };
  }

  if (snapshot.nearFloorOfferValueNative == null) {
    return {
      signalKey: "near_floor_bid_liquidity",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.near_floor_bid_liquidity,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: snapshot.observedAt,
        windowEnd: snapshot.observedAt,
      },
      completenessStatus:
        snapshot.completenessStatus === "complete" ? "unknown" : "partial",
      metadata: {
        reason: "near_floor_value_unavailable",
        marketSnapshotCompletenessStatus: snapshot.completenessStatus,
      },
    };
  }

  return {
    signalKey: "near_floor_bid_liquidity",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.near_floor_bid_liquidity,
    numericValue: snapshot.nearFloorOfferValueNative,
    structuredValue: null,
    sourceWindow: {
      windowStart: snapshot.observedAt,
      windowEnd: snapshot.observedAt,
    },
    completenessStatus:
      snapshot.completenessStatus === "complete" ? "complete" : "partial",
    metadata: {
      marketSnapshotCompletenessStatus: snapshot.completenessStatus,
      activeOfferCount: snapshot.activeOfferCount,
      floorPriceNative: snapshot.floorPriceNative,
    },
  };
}

function buildThirtyDayTradingVolumeSignal(
  context: LoadedFactContext
): SignalComputationResult {
  const window = toThirtyDayWindow(context.evaluatedAtMs);
  const windowStartMs = Date.parse(window.windowStart ?? "");
  const windowEndMs = Date.parse(window.windowEnd ?? "");
  const sales = filterSalesInWindow({
    salesEvents: context.salesEvents,
    windowStartMs,
    windowEndMs,
  });
  const volume = sales.qualifying.reduce(
    (total, sale) => total + (sale.priceAmountNative ?? 0),
    0
  );

  return {
    signalKey: "trading_volume_30d",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.trading_volume_30d,
    numericValue: volume,
    structuredValue: null,
    sourceWindow: window,
    completenessStatus: sales.droppedMissingPriceCount > 0 ? "partial" : "complete",
    metadata: {
      qualifyingSaleCount: sales.qualifying.length,
      inWindowSaleCount: sales.inWindow.length,
      droppedMissingPriceCount: sales.droppedMissingPriceCount,
    },
  };
}

function buildListingPressureSignal(context: LoadedFactContext): SignalComputationResult {
  const snapshot = pickLatestObservedFact(
    context.marketSnapshots,
    context.evaluatedAtMs
  );
  if (!snapshot) {
    return {
      signalKey: "listing_pressure",
      calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.listing_pressure,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: null,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "no_market_snapshot",
      },
    };
  }

  const supply = snapshot.totalSupply;
  const listedCount = snapshot.activeListingCount;
  const providerListedPct = snapshot.listedPct;
  const sourceWindow = {
    windowStart: snapshot.observedAt,
    windowEnd: snapshot.observedAt,
  };
  const baseMetadata: Record<string, unknown> = {
    marketSnapshotCompletenessStatus: snapshot.completenessStatus,
    activeListingCount: listedCount,
    totalSupply: supply,
    providerListedPct,
  };

  if (
    typeof supply === "number" &&
    Number.isFinite(supply) &&
    supply > 0 &&
    typeof listedCount === "number" &&
    Number.isFinite(listedCount) &&
    listedCount >= 0
  ) {
    const derivedPct = toBoundedPercent((listedCount / supply) * 100);
    const discrepancy =
      typeof providerListedPct === "number" && Number.isFinite(providerListedPct)
        ? Math.abs(providerListedPct - derivedPct)
        : null;
    return {
      signalKey: "listing_pressure",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.listing_pressure,
      numericValue: derivedPct,
      structuredValue: null,
      sourceWindow,
      completenessStatus:
        snapshot.completenessStatus === "complete" ? "complete" : "partial",
      metadata: {
        ...baseMetadata,
        method: "listed_count_over_supply",
        discrepancyPctVsProvider: discrepancy,
        hasMaterialDiscrepancy:
          discrepancy != null && discrepancy > LISTING_PRESSURE_DISCREPANCY_PCT,
      },
    };
  }

  if (
    typeof providerListedPct === "number" &&
    Number.isFinite(providerListedPct) &&
    providerListedPct >= 0
  ) {
    return {
      signalKey: "listing_pressure",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.listing_pressure,
      numericValue: toBoundedPercent(providerListedPct),
      structuredValue: null,
      sourceWindow,
      completenessStatus: "partial",
      metadata: {
        ...baseMetadata,
        method: "provider_listed_pct_fallback",
      },
    };
  }

  return {
    signalKey: "listing_pressure",
    calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.listing_pressure,
    numericValue: null,
    structuredValue: null,
    sourceWindow,
    completenessStatus:
      snapshot.completenessStatus === "unknown" ? "unknown" : "partial",
    metadata: {
      ...baseMetadata,
      reason: "insufficient_listing_or_supply_data",
    },
  };
}

function buildCollectorDemandQualitySignal(
  context: LoadedFactContext
): SignalComputationResult {
  const window = toThirtyDayWindow(context.evaluatedAtMs);
  const windowStartMs = Date.parse(window.windowStart ?? "");
  const windowEndMs = Date.parse(window.windowEnd ?? "");
  const sales = filterSalesInWindow({
    salesEvents: context.salesEvents,
    windowStartMs,
    windowEndMs,
  });

  const normalizedBuyers = sales.qualifying.map((sale) => {
    const buyer = sale.buyerAddress?.trim().toLowerCase();
    return buyer && buyer.length > 0 ? buyer : null;
  });
  const identifiableBuyers = normalizedBuyers.filter(
    (buyer): buyer is string => buyer != null
  );
  const uniqueBuyerCount = new Set(identifiableBuyers).size;
  const unknownBuyerSalesCount = normalizedBuyers.length - identifiableBuyers.length;

  const repeatBuyerConcentration =
    identifiableBuyers.length > 0
      ? 1 - uniqueBuyerCount / identifiableBuyers.length
      : null;

  const structuredValue: Record<string, unknown> = {
    salesAboveFloorPct: {
      value: null,
      status: "unknown",
      reason: "floor_at_sale_matching_unavailable_in_pr3a",
    },
    uniqueBuyerCount: {
      value: uniqueBuyerCount,
      status: unknownBuyerSalesCount > 0 ? "partial" : "complete",
    },
    repeatBuyerConcentration: {
      value: repeatBuyerConcentration,
      status:
        repeatBuyerConcentration == null
          ? "unknown"
          : unknownBuyerSalesCount > 0
            ? "partial"
            : "complete",
      formula: "1 - (unique_buyers / identifiable_buyer_sales)",
    },
    qualifyingSalesCount: sales.qualifying.length,
    identifiableBuyerSalesCount: identifiableBuyers.length,
    unknownBuyerSalesCount,
    droppedMissingPriceCount: sales.droppedMissingPriceCount,
  };

  return {
    signalKey: "collector_demand_quality",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.collector_demand_quality,
    numericValue: null,
    structuredValue,
    sourceWindow: window,
    completenessStatus: "partial",
    metadata: {
      note: "Collector Demand Quality v1 stores deterministic component signals only.",
    },
  };
}

function buildTraitDiversityIndexSignal(
  context: LoadedFactContext
): SignalComputationResult {
  const traitSnapshot = pickLatestObservedFact(
    context.traitSnapshots,
    context.evaluatedAtMs
  );
  const marketSnapshot = pickLatestObservedFact(
    context.marketSnapshots,
    context.evaluatedAtMs
  );

  if (!traitSnapshot) {
    return {
      signalKey: "trait_diversity_index",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.trait_diversity_index,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: null,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "no_trait_snapshot",
      },
    };
  }

  const distinctValues = traitSnapshot.distinctTraitValueCount;
  const traitCategories = traitSnapshot.traitCategoryCount;
  const supplyFromTrait = traitSnapshot.reportedSupply;
  const supplyFromMarket = marketSnapshot?.totalSupply ?? null;
  const supply = supplyFromTrait ?? supplyFromMarket;
  const sourceWindow = {
    windowStart: traitSnapshot.observedAt,
    windowEnd: traitSnapshot.observedAt,
  };

  if (
    typeof distinctValues === "number" &&
    Number.isFinite(distinctValues) &&
    distinctValues >= 0 &&
    typeof traitCategories === "number" &&
    Number.isFinite(traitCategories) &&
    traitCategories > 0 &&
    typeof supply === "number" &&
    Number.isFinite(supply) &&
    supply > 0
  ) {
    const denominator = supply * traitCategories;
    const density = denominator > 0 ? distinctValues / denominator : 0;
    const value = toBoundedDensity(density);
    const usedSupplyFallback =
      supplyFromTrait == null && typeof supplyFromMarket === "number";
    return {
      signalKey: "trait_diversity_index",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.trait_diversity_index,
      numericValue: value,
      structuredValue: null,
      sourceWindow,
      completenessStatus:
        traitSnapshot.completenessStatus === "complete" && !usedSupplyFallback
          ? "complete"
          : "partial",
      metadata: {
        formula:
          "distinct_trait_value_count / (supply * trait_category_count), bounded to [0,1]",
        distinctTraitValueCount: distinctValues,
        traitCategoryCount: traitCategories,
        supply,
        supplySource: supplyFromTrait != null ? "trait_snapshot" : "market_snapshot_fallback",
      },
    };
  }

  return {
    signalKey: "trait_diversity_index",
    calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.trait_diversity_index,
    numericValue: null,
    structuredValue: null,
    sourceWindow,
    completenessStatus:
      traitSnapshot.completenessStatus === "unknown" ? "unknown" : "partial",
    metadata: {
      reason: "insufficient_trait_or_supply_inputs",
      distinctTraitValueCount: distinctValues,
      traitCategoryCount: traitCategories,
      supplyFromTrait,
      supplyFromMarket,
    },
  };
}

function buildLayerComplexitySignal(context: LoadedFactContext): SignalComputationResult {
  const traitSnapshot = pickLatestObservedFact(
    context.traitSnapshots,
    context.evaluatedAtMs
  );
  if (!traitSnapshot) {
    return {
      signalKey: "layer_complexity",
      calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.layer_complexity,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: null,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "no_trait_snapshot",
      },
    };
  }

  if (
    typeof traitSnapshot.traitCategoryCount === "number" &&
    Number.isFinite(traitSnapshot.traitCategoryCount) &&
    traitSnapshot.traitCategoryCount >= 0
  ) {
    return {
      signalKey: "layer_complexity",
      calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.layer_complexity,
      numericValue: traitSnapshot.traitCategoryCount,
      structuredValue: null,
      sourceWindow: {
        windowStart: traitSnapshot.observedAt,
        windowEnd: traitSnapshot.observedAt,
      },
      completenessStatus:
        traitSnapshot.completenessStatus === "complete" ? "complete" : "partial",
      metadata: {
        source: "trait_category_count",
      },
    };
  }

  return {
    signalKey: "layer_complexity",
    calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.layer_complexity,
    numericValue: null,
    structuredValue: null,
    sourceWindow: {
      windowStart: traitSnapshot.observedAt,
      windowEnd: traitSnapshot.observedAt,
    },
    completenessStatus:
      traitSnapshot.completenessStatus === "unknown" ? "unknown" : "partial",
    metadata: {
      reason: "trait_category_count_unavailable",
    },
  };
}

function toUpsertInput(
  computed: SignalComputationResult,
  context: LoadedFactContext,
  collectionIdentityId: string
): UpsertCollectionSignalValueInput {
  return {
    collectionIdentityId,
    signalKey: computed.signalKey,
    calculationVersion: computed.calculationVersion,
    numericValue: computed.numericValue,
    structuredValue: computed.structuredValue,
    computedAt: context.evaluatedAt,
    sourceWindowStart: computed.sourceWindow.windowStart,
    sourceWindowEnd: computed.sourceWindow.windowEnd,
    completenessStatus: computed.completenessStatus,
    metadata: computed.metadata,
  };
}

function computeSignal(
  signalKey: CollectionDerivedSignalKey,
  context: LoadedFactContext
): SignalComputationResult {
  switch (signalKey) {
    case "near_floor_bid_liquidity":
      return buildNearFloorBidLiquiditySignal(context);
    case "trading_volume_30d":
      return buildThirtyDayTradingVolumeSignal(context);
    case "listing_pressure":
      return buildListingPressureSignal(context);
    case "collector_demand_quality":
      return buildCollectorDemandQualitySignal(context);
    case "trait_diversity_index":
      return buildTraitDiversityIndexSignal(context);
    case "layer_complexity":
      return buildLayerComplexitySignal(context);
    default:
      throw new Error(`Unsupported signal key: ${signalKey}`);
  }
}

export function createCollectionSignalService(options: {
  factsRepository: CollectionFactsRepository;
  signalRepository: CollectionSignalRepository;
  now?: () => Date;
}): CollectionSignalService {
  const now = options.now ?? (() => new Date());

  async function loadFactContext(input: {
    collectionIdentityId: string;
    evaluatedAt: string;
  }): Promise<LoadedFactContext> {
    const evaluatedAtMs = Date.parse(input.evaluatedAt);
    const [marketSnapshots, traitSnapshots, salesEvents] = await Promise.all([
      options.factsRepository.listCollectionMarketSnapshots(input.collectionIdentityId),
      options.factsRepository.listCollectionTraitSnapshots(input.collectionIdentityId),
      options.factsRepository.listCollectionSaleEvents(input.collectionIdentityId),
    ]);
    return {
      evaluatedAt: input.evaluatedAt,
      evaluatedAtMs,
      marketSnapshots,
      traitSnapshots,
      salesEvents,
    };
  }

  return {
    async computeCollectionSignal(
      input: ComputeCollectionSignalInput
    ): Promise<CollectionSignalValue> {
      const evaluatedAt = toEvaluatedAtIso(input.evaluatedAt, now);
      const context = await loadFactContext({
        collectionIdentityId: input.collectionIdentityId,
        evaluatedAt,
      });
      const computed = computeSignal(input.signalKey, context);
      const persisted = await options.signalRepository.upsertCollectionSignalValues([
        toUpsertInput(computed, context, input.collectionIdentityId),
      ]);
      const first = persisted[0];
      if (!first) {
        throw new Error(`Signal upsert failed for ${input.signalKey}.`);
      }
      return first;
    },

    async computeMvpCollectionSignalBatch(
      input: ComputeCollectionSignalBatchInput
    ): Promise<readonly CollectionSignalValue[]> {
      const evaluatedAt = toEvaluatedAtIso(input.evaluatedAt, now);
      const context = await loadFactContext({
        collectionIdentityId: input.collectionIdentityId,
        evaluatedAt,
      });
      const payload = COLLECTION_DERIVED_SIGNAL_KEYS.map((signalKey) =>
        toUpsertInput(
          computeSignal(signalKey, context),
          context,
          input.collectionIdentityId
        )
      );
      return options.signalRepository.upsertCollectionSignalValues(payload);
    },

    async listLatestCollectionSignals(
      collectionIdentityId: string
    ): Promise<readonly CollectionSignalValue[]> {
      return options.signalRepository.listLatestCollectionSignalValues(collectionIdentityId);
    },
  };
}
