import { createHash } from "node:crypto";

export const COLLECTION_FACT_COMPLETENESS_STATUSES = [
  "complete",
  "partial",
  "unknown",
] as const;

export type CollectionFactCompletenessStatus =
  (typeof COLLECTION_FACT_COMPLETENESS_STATUSES)[number];

export const COLLECTION_FACT_SYNC_STATUSES = [
  "running",
  "success",
  "failure",
] as const;

export type CollectionFactSyncStatus = (typeof COLLECTION_FACT_SYNC_STATUSES)[number];

export const COLLECTION_ALIAS_KINDS = [
  "slug",
  "provider_id",
  "contract_alias",
] as const;

export type CollectionAliasKind = (typeof COLLECTION_ALIAS_KINDS)[number];

export interface CollectionIdentity {
  id: string;
  chainNamespace: string;
  contractAddress: string;
  canonicalId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionIdentityAlias {
  id: string;
  collectionIdentityId: string;
  provider: string;
  aliasKind: CollectionAliasKind;
  aliasValue: string;
  normalizedAliasValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFactProvenance {
  sourceProvider: string;
  sourceEndpoint: string | null;
  observedAt: string;
  ingestedAt: string;
  completenessStatus: CollectionFactCompletenessStatus;
}

export interface CollectionMarketSnapshotFact extends CollectionFactProvenance {
  id: string;
  collectionIdentityId: string;
  floorPriceNative: number | null;
  topOfferNative: number | null;
  nearFloorOfferValueNative: number | null;
  activeOfferCount: number | null;
  activeListingCount: number | null;
  totalSupply: number | null;
  holderCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSaleEventFact extends CollectionFactProvenance {
  id: string;
  collectionIdentityId: string;
  eventId: string;
  sourceSaleId: string | null;
  chainNamespace: string;
  contractAddress: string;
  tokenId: string;
  transactionHash: string | null;
  logIndex: number | null;
  eventIndex: number | null;
  buyerAddress: string | null;
  sellerAddress: string | null;
  priceCurrency: string | null;
  priceAmountNative: number | null;
  priceAmountUsd: number | null;
  soldAt: string;
  marketplace: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionTraitSnapshotFact extends CollectionFactProvenance {
  id: string;
  collectionIdentityId: string;
  traitCategoryCount: number | null;
  distinctTraitValueCount: number | null;
  reportedSupply: number | null;
  oneOfOneAssetCount: number | null;
  oneOfOneSupplyPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionFactSyncRun {
  id: string;
  sourceProvider: string;
  sourceEndpoint: string | null;
  syncScope: string;
  syncStatus: CollectionFactSyncStatus;
  syncStartedAt: string;
  syncCompletedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  errorMetadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSaleEventIdentityInput {
  chainNamespace: string;
  sourceProvider: string;
  sourceSaleId?: string | null;
  transactionHash?: string | null;
  logIndex?: number | null;
  eventIndex?: number | null;
  contractAddress: string;
  tokenId: string;
  buyerAddress?: string | null;
  sellerAddress?: string | null;
  priceCurrency?: string | null;
  priceAmountNative?: number | null;
  soldAt: string;
}

function normalizeChainNamespaceInput(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error("chainNamespace cannot be empty.");
  }
  return normalized;
}

function normalizeEvmLikeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function normalizeCollectionContractAddress(
  chainNamespace: string,
  contractAddress: string
): string {
  const normalizedChain = normalizeChainNamespaceInput(chainNamespace);
  const trimmedAddress = contractAddress.trim();
  if (!trimmedAddress) {
    throw new Error("contractAddress cannot be empty.");
  }
  if (normalizedChain === "eip155") {
    return normalizeEvmLikeAddress(trimmedAddress);
  }
  return trimmedAddress;
}

export function normalizeCollectionChainNamespace(chainNamespace: string): string {
  return normalizeChainNamespaceInput(chainNamespace);
}

export function toCollectionCanonicalId(
  chainNamespace: string,
  contractAddress: string
): string {
  const normalizedChain = normalizeCollectionChainNamespace(chainNamespace);
  const normalizedContract = normalizeCollectionContractAddress(
    normalizedChain,
    contractAddress
  );
  return `${normalizedChain}:${normalizedContract}`;
}

export function normalizeCollectionAliasValue(aliasValue: string): string {
  const normalized = aliasValue.trim().toLowerCase();
  if (!normalized) {
    throw new Error("aliasValue cannot be empty.");
  }
  return normalized;
}

export function toCollectionAliasLookupKey(input: {
  provider: string;
  aliasKind: CollectionAliasKind;
  normalizedAliasValue: string;
}): string {
  const provider = input.provider.trim().toLowerCase();
  if (!provider) {
    throw new Error("provider cannot be empty.");
  }
  return `${provider}:${input.aliasKind}:${input.normalizedAliasValue}`;
}

function normalizeHash(hash: string): string {
  const trimmed = hash.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return `0x${trimmed.slice(2).toLowerCase()}`;
  }
  return trimmed.toLowerCase();
}

function toFingerprintValue(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

function hashSaleEventFallback(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function toCollectionSaleEventId(
  input: CollectionSaleEventIdentityInput
): string {
  const chainNamespace = normalizeCollectionChainNamespace(input.chainNamespace);
  const transactionHash = input.transactionHash
    ? normalizeHash(input.transactionHash)
    : "";
  const hasLogIndex = Number.isInteger(input.logIndex);
  if (transactionHash && hasLogIndex) {
    return `tx:${chainNamespace}:${transactionHash}:${input.logIndex}`;
  }

  const sourceSaleId = toFingerprintValue(input.sourceSaleId);
  if (sourceSaleId) {
    const provider = input.sourceProvider.trim().toLowerCase();
    return `provider:${provider}:${sourceSaleId.toLowerCase()}`;
  }

  const normalizedContractAddress = normalizeCollectionContractAddress(
    chainNamespace,
    input.contractAddress
  );
  const fingerprint = [
    chainNamespace,
    normalizedContractAddress,
    input.tokenId.trim(),
    normalizeHash(transactionHash),
    toFingerprintValue(input.logIndex),
    toFingerprintValue(input.eventIndex),
    toFingerprintValue(input.buyerAddress).toLowerCase(),
    toFingerprintValue(input.sellerAddress).toLowerCase(),
    toFingerprintValue(input.priceCurrency).toUpperCase(),
    toFingerprintValue(input.priceAmountNative),
    input.soldAt.trim(),
    input.sourceProvider.trim().toLowerCase(),
  ].join("|");

  return `fallback:${hashSaleEventFallback(fingerprint)}`;
}

export function computeCollectionFactSyncDurationMs(
  syncStartedAt: string,
  syncCompletedAt: string
): number {
  const startedMs = Date.parse(syncStartedAt);
  const completedMs = Date.parse(syncCompletedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) {
    return 0;
  }
  return Math.max(0, completedMs - startedMs);
}
