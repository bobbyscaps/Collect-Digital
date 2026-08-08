import { createHash } from "node:crypto";

import type { CollectionFactCompletenessStatus } from "@/lib/collection-facts/domain";

export const COLLECTION_DERIVED_SIGNAL_KEYS = [
  "near_floor_bid_liquidity",
  "trading_volume_30d",
  "listing_pressure",
  "holder_distribution",
  "holder_growth",
  "project_maturity",
  "sales_above_floor_pct",
  "collector_demand_quality",
  "trait_diversity_index",
  "layer_complexity",
] as const;

export type CollectionDerivedSignalKey =
  (typeof COLLECTION_DERIVED_SIGNAL_KEYS)[number];

export const COLLECTION_DERIVED_SIGNAL_CALCULATION_VERSIONS: Record<
  CollectionDerivedSignalKey,
  string
> = {
  near_floor_bid_liquidity: "near_floor_bid_liquidity:v1",
  trading_volume_30d: "trading_volume_30d:v1",
  listing_pressure: "listing_pressure:v1",
  holder_distribution: "holder_distribution:v1",
  holder_growth: "holder_growth:v1",
  project_maturity: "project_maturity:v1",
  sales_above_floor_pct: "sales_above_floor_pct:v1",
  collector_demand_quality: "collector_demand_quality:v2",
  trait_diversity_index: "trait_diversity_index:v1",
  layer_complexity: "layer_complexity:v1",
};

export interface CollectionSignalSourceWindow {
  windowStart: string | null;
  windowEnd: string | null;
}

export interface CollectionSignalValue {
  id: string;
  collectionIdentityId: string;
  signalKey: CollectionDerivedSignalKey;
  calculationVersion: string;
  signalRunKey: string;
  numericValue: number | null;
  structuredValue: Record<string, unknown> | null;
  computedAt: string;
  sourceWindowStart: string | null;
  sourceWindowEnd: string | null;
  completenessStatus: CollectionFactCompletenessStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeSignalWindowValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim();
}

export function toCollectionSignalRunKey(input: {
  collectionIdentityId: string;
  signalKey: CollectionDerivedSignalKey;
  calculationVersion: string;
  computedAt: string;
  sourceWindowStart?: string | null;
  sourceWindowEnd?: string | null;
}): string {
  const parts = [
    input.collectionIdentityId.trim(),
    input.signalKey,
    input.calculationVersion.trim(),
    input.computedAt.trim(),
    normalizeSignalWindowValue(input.sourceWindowStart),
    normalizeSignalWindowValue(input.sourceWindowEnd),
  ];
  const canonicalSeed = parts.join("|");
  const hash = createHash("sha256").update(canonicalSeed).digest("hex");
  return `signal:${hash}`;
}

export function toIsoDateFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function toSignalCompletenessStatus(input: {
  hasRequiredData: boolean;
  hasPartialData: boolean;
}): CollectionFactCompletenessStatus {
  if (input.hasRequiredData && !input.hasPartialData) {
    return "complete";
  }
  if (input.hasRequiredData || input.hasPartialData) {
    return "partial";
  }
  return "unknown";
}
