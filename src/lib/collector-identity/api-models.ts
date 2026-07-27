import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { CollectorProfileInventoryStatus } from "@/lib/collector-profile/domain";

/**
 * Public Collector Identity API models (PR8).
 *
 * Typed transport contracts only — never expose repositories, provider payloads,
 * or domain service instances to clients.
 */

export const COLLECTOR_IDENTITY_API_SCHEMA_VERSION = 1 as const;

/**
 * Progressive lifecycle for each independent Collector Identity section.
 * One unavailable section must never block the rest of the identity.
 */
export type ProgressiveDataState =
  | "loading"
  | "live"
  | "stale"
  | "empty"
  | "partial"
  | "error"
  | "coming_soon";

/**
 * Envelope owned by each identity section.
 * `data` is null for loading / empty / error / coming_soon (unless stale/partial
 * carries last-known real values).
 */
export interface ProgressiveSection<T> {
  state: ProgressiveDataState;
  data: T | null;
  /** ISO timestamp of the last successful real persistence for this section. */
  lastUpdatedAt: string | null;
  message: string | null;
}

export interface CollectorIdentityIdentityData {
  profileId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface CollectorIdentityWallet {
  walletId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  normalizedAddress: string;
}

export interface CollectorIdentityWalletsData {
  verifiedWalletCount: number;
  verifiedWallets: readonly CollectorIdentityWallet[];
  /** Newest successful inventory sync across verified wallets (informational). */
  latestSuccessfulSync: string | null;
  chainDistribution: Readonly<Partial<Record<WalletChainNamespace, number>>>;
}

export interface CollectorIdentityInventoryData {
  inventoryStatus: CollectorProfileInventoryStatus;
  totalCollections: number;
  uniqueTokenCount: number;
  totalQuantity: string;
}

export interface CollectorIdentityCollectionSummaryData {
  collectionId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  uniqueTokenCount: number;
  totalQuantity: string;
  walletsContainingCollection: readonly string[];
}

export interface CollectorIdentityAssetTraitFloorData {
  traitType: string | null;
  traitValue: string | null;
  floorPriceEth: number;
}

export interface CollectorIdentityAssetData {
  assetId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  collectionName: string | null;
  collectionFloorPriceEth: number | null;
  topTraitFloor: CollectorIdentityAssetTraitFloorData | null;
  openseaUrl: string;
}

/**
 * Reserved dynamic status modules — always current state when implemented.
 * PR8 returns Coming Soon (never fabricated scores / social counts).
 */
export interface CollectorIdentityStatusModules {
  collectorScore: ProgressiveSection<null>;
  collectionScores: ProgressiveSection<null>;
  communities: ProgressiveSection<null>;
  followers: ProgressiveSection<null>;
  following: ProgressiveSection<null>;
}

/**
 * Authenticated Collector Identity response for GET /api/collector-identity/me.
 */
export interface CollectorIdentityResponse {
  schemaVersion: typeof COLLECTOR_IDENTITY_API_SCHEMA_VERSION;
  profileId: string;
  identity: ProgressiveSection<CollectorIdentityIdentityData>;
  wallets: ProgressiveSection<CollectorIdentityWalletsData>;
  inventory: ProgressiveSection<CollectorIdentityInventoryData>;
  collectionSummaries: ProgressiveSection<
    readonly CollectorIdentityCollectionSummaryData[]
  >;
  assets: ProgressiveSection<readonly CollectorIdentityAssetData[]>;
  /** Dynamic current-status modules (not achievements). */
  statusModules: CollectorIdentityStatusModules;
  /**
   * Permanent achievements section.
   * Coming Soon until achievement persistence/awarding ships.
   */
  achievements: ProgressiveSection<null>;
}

export type CollectorIdentityApiErrorCode =
  | "authentication_required"
  | "invalid_token"
  | "profile_not_found"
  | "service_unavailable"
  | "internal_error";

export interface CollectorIdentityApiError {
  code: CollectorIdentityApiErrorCode;
  message: string;
}

export interface CollectorIdentityErrorResponse {
  error: CollectorIdentityApiError;
}

export function comingSoonSection(
  message = "Coming Soon"
): ProgressiveSection<null> {
  return {
    state: "coming_soon",
    data: null,
    lastUpdatedAt: null,
    message,
  };
}

export function loadingSection<T>(): ProgressiveSection<T> {
  return {
    state: "loading",
    data: null,
    lastUpdatedAt: null,
    message: null,
  };
}

export function errorSection<T>(message: string): ProgressiveSection<T> {
  return {
    state: "error",
    data: null,
    lastUpdatedAt: null,
    message,
  };
}

export function emptySection<T>(message: string): ProgressiveSection<T> {
  return {
    state: "empty",
    data: null,
    lastUpdatedAt: null,
    message,
  };
}
