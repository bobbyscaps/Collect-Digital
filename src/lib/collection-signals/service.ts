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
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const HOLDER_GROWTH_SNAPSHOT_TOLERANCE_MS = 72 * 60 * 60 * 1000;
const FLOOR_AT_SALE_TOLERANCE_MS = 48 * 60 * 60 * 1000;
const SALES_ABOVE_FLOOR_MIN_COVERAGE_COMPLETE_PCT = 90;
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

function pickSnapshotAtOrBeforeWithinTolerance<T extends { observedAt: string }>(
  values: readonly T[],
  targetMs: number,
  toleranceMs: number
): { snapshot: T; ageMs: number } | null {
  let selected: T | null = null;
  let selectedMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const observedAtMs = Date.parse(value.observedAt);
    if (!Number.isFinite(observedAtMs)) continue;
    if (observedAtMs > targetMs) continue;
    if (observedAtMs > selectedMs) {
      selected = value;
      selectedMs = observedAtMs;
    }
  }
  if (!selected) return null;
  const ageMs = targetMs - selectedMs;
  if (ageMs > toleranceMs) {
    return null;
  }
  return {
    snapshot: selected,
    ageMs,
  };
}

function monthKeyFromIso(isoTimestamp: string): string | null {
  const ms = Date.parse(isoTimestamp);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthDistanceInclusive(startMonth: string, endMonth: string): number {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonthNumber) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonthNumber)
  ) {
    return 0;
  }
  const startIndex = startYear * 12 + (startMonthNumber - 1);
  const endIndex = endYear * 12 + (endMonthNumber - 1);
  if (endIndex < startIndex) return 0;
  return endIndex - startIndex + 1;
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

interface SalesAboveFloorComputation {
  value: number | null;
  completenessStatus: CollectionFactCompletenessStatus;
  sourceWindow: CollectionSignalSourceWindow;
  metadata: Record<string, unknown>;
}

function computeSalesAboveFloorPct(context: LoadedFactContext): SalesAboveFloorComputation {
  const sourceWindow = toThirtyDayWindow(context.evaluatedAtMs);
  const windowStartMs = Date.parse(sourceWindow.windowStart ?? "");
  const windowEndMs = Date.parse(sourceWindow.windowEnd ?? "");
  const sales = filterSalesInWindow({
    salesEvents: context.salesEvents,
    windowStartMs,
    windowEndMs,
  });

  let measurableSalesCount = 0;
  let aboveFloorSalesCount = 0;
  let atOrBelowFloorSalesCount = 0;
  let missingFloorSalesCount = 0;
  const floorSnapshotAgeHoursSamples: number[] = [];

  for (const sale of sales.qualifying) {
    const soldAtMs = Date.parse(sale.soldAt);
    if (!Number.isFinite(soldAtMs)) continue;
    const floorSnapshotMatch = pickSnapshotAtOrBeforeWithinTolerance(
      context.marketSnapshots,
      soldAtMs,
      FLOOR_AT_SALE_TOLERANCE_MS
    );
    if (!floorSnapshotMatch) {
      missingFloorSalesCount += 1;
      continue;
    }
    const floor = floorSnapshotMatch.snapshot.floorPriceNative;
    if (typeof floor !== "number" || !Number.isFinite(floor) || floor <= 0) {
      missingFloorSalesCount += 1;
      continue;
    }
    measurableSalesCount += 1;
    floorSnapshotAgeHoursSamples.push(floorSnapshotMatch.ageMs / (60 * 60 * 1000));
    const price = sale.priceAmountNative ?? 0;
    if (price > floor) {
      aboveFloorSalesCount += 1;
    } else {
      atOrBelowFloorSalesCount += 1;
    }
  }

  const totalQualifyingSalesCount = sales.qualifying.length;
  const coveragePct =
    totalQualifyingSalesCount > 0
      ? (measurableSalesCount / totalQualifyingSalesCount) * 100
      : 0;
  const value =
    measurableSalesCount > 0
      ? toBoundedPercent((aboveFloorSalesCount / measurableSalesCount) * 100)
      : null;

  const completenessStatus: CollectionFactCompletenessStatus =
    measurableSalesCount === 0
      ? totalQualifyingSalesCount > 0
        ? "partial"
        : "unknown"
      : coveragePct >= SALES_ABOVE_FLOOR_MIN_COVERAGE_COMPLETE_PCT &&
          missingFloorSalesCount === 0
        ? "complete"
        : "partial";

  const averageFloorSnapshotAgeHours =
    floorSnapshotAgeHoursSamples.length > 0
      ? floorSnapshotAgeHoursSamples.reduce((sum, age) => sum + age, 0) /
        floorSnapshotAgeHoursSamples.length
      : null;

  return {
    value,
    completenessStatus,
    sourceWindow,
    metadata: {
      totalQualifyingSalesCount,
      measurableSalesCount,
      missingFloorSalesCount,
      aboveFloorSalesCount,
      atOrBelowFloorSalesCount,
      coveragePct,
      floorSnapshotToleranceHours: FLOOR_AT_SALE_TOLERANCE_MS / (60 * 60 * 1000),
      averageFloorSnapshotAgeHours,
      droppedMissingPriceCount: sales.droppedMissingPriceCount,
    },
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

function buildHolderDistributionSignal(
  context: LoadedFactContext
): SignalComputationResult {
  const snapshot = pickLatestObservedFact(
    context.marketSnapshots,
    context.evaluatedAtMs
  );
  if (!snapshot) {
    return {
      signalKey: "holder_distribution",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_distribution,
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

  const holders = snapshot.holderCount;
  const supply = snapshot.totalSupply;
  const sourceWindow = {
    windowStart: snapshot.observedAt,
    windowEnd: snapshot.observedAt,
  };

  if (
    typeof holders === "number" &&
    Number.isFinite(holders) &&
    holders >= 0 &&
    typeof supply === "number" &&
    Number.isFinite(supply) &&
    supply > 0
  ) {
    const holderRatio = toBoundedDensity(holders / supply);
    const structuredValue: Record<string, unknown> = {
      holderRatio,
      holderRatioPct: holderRatio * 100,
      topHolderConcentrationPct: {
        value: null,
        status: "unknown",
        reason: "holder_distribution_per_wallet_facts_not_yet_ingested",
      },
    };
    return {
      signalKey: "holder_distribution",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_distribution,
      numericValue: null,
      structuredValue,
      sourceWindow,
      completenessStatus: "partial",
      metadata: {
        marketSnapshotCompletenessStatus: snapshot.completenessStatus,
        holderCount: holders,
        totalSupply: supply,
      },
    };
  }

  return {
    signalKey: "holder_distribution",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_distribution,
    numericValue: null,
    structuredValue: null,
    sourceWindow,
    completenessStatus:
      snapshot.completenessStatus === "unknown" ? "unknown" : "partial",
    metadata: {
      reason: "missing_holder_or_supply_inputs",
      holderCount: holders,
      totalSupply: supply,
    },
  };
}

function buildHolderGrowthSignal(context: LoadedFactContext): SignalComputationResult {
  const currentMatch = pickSnapshotAtOrBeforeWithinTolerance(
    context.marketSnapshots,
    context.evaluatedAtMs,
    HOLDER_GROWTH_SNAPSHOT_TOLERANCE_MS
  );
  if (!currentMatch) {
    return {
      signalKey: "holder_growth",
      calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_growth,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: null,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "missing_current_holder_snapshot_within_tolerance",
        snapshotToleranceHours:
          HOLDER_GROWTH_SNAPSHOT_TOLERANCE_MS / (60 * 60 * 1000),
      },
    };
  }

  const currentHolders = currentMatch.snapshot.holderCount;
  if (
    typeof currentHolders !== "number" ||
    !Number.isFinite(currentHolders) ||
    currentHolders < 0
  ) {
    return {
      signalKey: "holder_growth",
      calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_growth,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: currentMatch.snapshot.observedAt,
        windowEnd: currentMatch.snapshot.observedAt,
      },
      completenessStatus: "partial",
      metadata: {
        reason: "current_holder_count_unavailable",
      },
    };
  }

  const windows = [
    { key: "growth7d", durationMs: SEVEN_DAYS_MS, label: "7d" },
    { key: "growth30d", durationMs: THIRTY_DAYS_MS, label: "30d" },
    { key: "growth90d", durationMs: NINETY_DAYS_MS, label: "90d" },
  ] as const;

  const structured: Record<string, unknown> = {};
  let hasAnyMeasured = false;
  let allComplete = true;
  let sourceWindowStartMs = context.evaluatedAtMs;

  for (const window of windows) {
    const targetMs = context.evaluatedAtMs - window.durationMs;
    sourceWindowStartMs = Math.min(sourceWindowStartMs, targetMs);
    const previousMatch = pickSnapshotAtOrBeforeWithinTolerance(
      context.marketSnapshots,
      targetMs,
      HOLDER_GROWTH_SNAPSHOT_TOLERANCE_MS
    );

    if (!previousMatch) {
      allComplete = false;
      structured[window.key] = {
        value: null,
        status: "unknown",
        reason: "missing_historical_snapshot_within_tolerance",
        targetAt: toIsoDateFromMs(targetMs),
      };
      continue;
    }

    const previousHolders = previousMatch.snapshot.holderCount;
    if (
      typeof previousHolders !== "number" ||
      !Number.isFinite(previousHolders) ||
      previousHolders <= 0
    ) {
      allComplete = false;
      structured[window.key] = {
        value: null,
        status: "unknown",
        reason: "invalid_previous_holder_count",
        previousHolderCount: previousHolders,
        previousObservedAt: previousMatch.snapshot.observedAt,
      };
      continue;
    }

    const growthPct = ((currentHolders - previousHolders) / previousHolders) * 100;
    const status =
      currentMatch.snapshot.completenessStatus === "complete" &&
      previousMatch.snapshot.completenessStatus === "complete"
        ? "complete"
        : "partial";
    if (status !== "complete") {
      allComplete = false;
    }
    hasAnyMeasured = true;
    structured[window.key] = {
      value: growthPct,
      status,
      currentHolderCount: currentHolders,
      previousHolderCount: previousHolders,
      currentObservedAt: currentMatch.snapshot.observedAt,
      previousObservedAt: previousMatch.snapshot.observedAt,
      snapshotAgeHours: previousMatch.ageMs / (60 * 60 * 1000),
    };
  }

  const completenessStatus: CollectionFactCompletenessStatus = hasAnyMeasured
    ? allComplete
      ? "complete"
      : "partial"
    : "unknown";

  return {
    signalKey: "holder_growth",
    calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.holder_growth,
    numericValue: null,
    structuredValue: structured,
    sourceWindow: {
      windowStart: toIsoDateFromMs(sourceWindowStartMs),
      windowEnd: context.evaluatedAt,
    },
    completenessStatus,
    metadata: {
      snapshotToleranceHours:
        HOLDER_GROWTH_SNAPSHOT_TOLERANCE_MS / (60 * 60 * 1000),
    },
  };
}

function buildSalesAboveFloorPctSignal(
  context: LoadedFactContext
): SignalComputationResult {
  const component = computeSalesAboveFloorPct(context);
  return {
    signalKey: "sales_above_floor_pct",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.sales_above_floor_pct,
    numericValue: component.value,
    structuredValue: null,
    sourceWindow: component.sourceWindow,
    completenessStatus: component.completenessStatus,
    metadata: component.metadata,
  };
}

function buildProjectMaturitySignal(context: LoadedFactContext): SignalComputationResult {
  const qualifyingSales = context.salesEvents.filter((sale) => {
    const soldAtMs = Date.parse(sale.soldAt);
    return (
      Number.isFinite(soldAtMs) &&
      soldAtMs <= context.evaluatedAtMs &&
      typeof sale.priceAmountNative === "number" &&
      Number.isFinite(sale.priceAmountNative) &&
      sale.priceAmountNative > 0
    );
  });

  if (qualifyingSales.length === 0) {
    return {
      signalKey: "project_maturity",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.project_maturity,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: context.evaluatedAt,
      },
      completenessStatus: "unknown",
      metadata: {
        reason: "no_verified_sales_in_persisted_facts",
        historicalCoverage: "unknown",
      },
    };
  }

  const salesMonthKeys = qualifyingSales
    .map((sale) => monthKeyFromIso(sale.soldAt))
    .filter((key): key is string => key != null);
  const uniqueActiveMonths = new Set(salesMonthKeys);
  const firstSale = qualifyingSales.reduce((earliest, sale) =>
    Date.parse(sale.soldAt) < Date.parse(earliest.soldAt) ? sale : earliest
  );
  const latestSale = qualifyingSales.reduce((latest, sale) =>
    Date.parse(sale.soldAt) > Date.parse(latest.soldAt) ? sale : latest
  );

  const firstSaleMonth = monthKeyFromIso(firstSale.soldAt);
  const latestSaleMonth = monthKeyFromIso(latestSale.soldAt);
  const evaluatedMonth = monthKeyFromIso(context.evaluatedAt);

  if (!firstSaleMonth || !latestSaleMonth || !evaluatedMonth) {
    return {
      signalKey: "project_maturity",
      calculationVersion:
        COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.project_maturity,
      numericValue: null,
      structuredValue: null,
      sourceWindow: {
        windowStart: null,
        windowEnd: context.evaluatedAt,
      },
      completenessStatus: "partial",
      metadata: {
        reason: "unable_to_align_sales_months",
        historicalCoverage: "unknown",
      },
    };
  }

  const monthsSinceFirstSale = monthDistanceInclusive(firstSaleMonth, evaluatedMonth);
  const activeMonthsCount = uniqueActiveMonths.size;
  const activeMonthRatio =
    monthsSinceFirstSale > 0 ? activeMonthsCount / monthsSinceFirstSale : 0;
  const monthsSinceLatestSale = Math.max(
    0,
    monthDistanceInclusive(latestSaleMonth, evaluatedMonth) - 1
  );
  const historicalCoverageStatus =
    monthsSinceFirstSale >= 12 ? "moderate" : "limited";

  return {
    signalKey: "project_maturity",
    calculationVersion: COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.project_maturity,
    numericValue: null,
    structuredValue: {
      monthsSinceFirstVerifiedSale: monthsSinceFirstSale,
      activeMonthsCount,
      activeMonthRatio,
      consecutiveInactiveMonths: monthsSinceLatestSale,
    },
    sourceWindow: {
      windowStart: firstSale.soldAt,
      windowEnd: context.evaluatedAt,
    },
    completenessStatus: "partial",
    metadata: {
      note: "Historical sales coverage completeness is unknown without explicit backfill coverage facts.",
      historicalCoverage: historicalCoverageStatus,
      salesCountInPersistedHistory: qualifyingSales.length,
      firstSaleAt: firstSale.soldAt,
      latestSaleAt: latestSale.soldAt,
    },
  };
}

function buildCollectorDemandQualitySignal(
  context: LoadedFactContext
): SignalComputationResult {
  const salesAboveFloor = computeSalesAboveFloorPct(context);
  const window = salesAboveFloor.sourceWindow;
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
  const repeatBuyerStatus: "complete" | "partial" | "unknown" =
    repeatBuyerConcentration == null
      ? "unknown"
      : unknownBuyerSalesCount > 0
        ? "partial"
        : "complete";
  const uniqueBuyerStatus: "complete" | "partial" =
    unknownBuyerSalesCount > 0 ? "partial" : "complete";

  const structuredValue: Record<string, unknown> = {
    salesAboveFloorPct: {
      value: salesAboveFloor.value,
      status: salesAboveFloor.completenessStatus,
      coveragePct: salesAboveFloor.metadata.coveragePct,
      measurableSalesCount: salesAboveFloor.metadata.measurableSalesCount,
      totalQualifyingSalesCount:
        salesAboveFloor.metadata.totalQualifyingSalesCount,
      missingFloorSalesCount: salesAboveFloor.metadata.missingFloorSalesCount,
      floorSnapshotToleranceHours:
        salesAboveFloor.metadata.floorSnapshotToleranceHours,
    },
    uniqueBuyerCount: {
      value: uniqueBuyerCount,
      status: uniqueBuyerStatus,
    },
    repeatBuyerConcentration: {
      value: repeatBuyerConcentration,
      status: repeatBuyerStatus,
      formula: "1 - (unique_buyers / identifiable_buyer_sales)",
    },
    qualifyingSalesCount: sales.qualifying.length,
    identifiableBuyerSalesCount: identifiableBuyers.length,
    unknownBuyerSalesCount,
    droppedMissingPriceCount: sales.droppedMissingPriceCount,
  };

  const completenessStatus: CollectionFactCompletenessStatus =
    salesAboveFloor.completenessStatus === "complete" &&
    uniqueBuyerStatus === "complete" &&
    repeatBuyerStatus === "complete" &&
    sales.droppedMissingPriceCount === 0
      ? "complete"
      : sales.qualifying.length > 0
        ? "partial"
        : "unknown";

  return {
    signalKey: "collector_demand_quality",
    calculationVersion:
      COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS.collector_demand_quality,
    numericValue: null,
    structuredValue,
    sourceWindow: window,
    completenessStatus,
    metadata: {
      note: "Collector Demand Quality v2 stores deterministic component signals only.",
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
    case "holder_distribution":
      return buildHolderDistributionSignal(context);
    case "holder_growth":
      return buildHolderGrowthSignal(context);
    case "project_maturity":
      return buildProjectMaturitySignal(context);
    case "sales_above_floor_pct":
      return buildSalesAboveFloorPctSignal(context);
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
