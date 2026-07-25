import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * Known NFT/asset standards for EVM and Solana.
 * Unknown provider values persist as "unknown" (never rejected).
 * Stored as free-form text in Postgres so future chains need no schema change.
 */
export const KNOWN_ASSET_STANDARDS = [
  "erc721",
  "erc1155",
  "solana_nft",
  "solana_pnft",
  "unknown",
] as const;

export type AssetStandard = (typeof KNOWN_ASSET_STANDARDS)[number];

export type WalletInventorySyncStatus =
  | "idle"
  | "running"
  | "success"
  | "failure";

/**
 * Provider-independent normalized holding persisted for future analysis.
 * Inventory is storage only — not scoring, rarity, or valuation.
 */
export interface NormalizedHolding {
  id: string;
  walletId: string;
  chainNamespace: WalletChainNamespace;
  contractAddress: string;
  tokenId: string;
  assetStandard: AssetStandard;
  quantity: string;
  /**
   * Stable collection identity: `${chainNamespace}:${collectionAddress}`.
   * - EVM: collectionAddress is the NFT contract.
   * - Solana: Metaplex verified collection address when known; otherwise the
   *   individual mint (per-mint singleton until a verified collection exists).
   * Never a marketplace slug or provider catalog id.
   */
  collectionId: string | null;
  ownerAddress: string;
  acquiredAt: string | null;
  lastSeenAt: string;
  sourceProvider: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletInventorySync {
  id: string;
  walletId: string;
  provider: string;
  syncStatus: WalletInventorySyncStatus;
  syncStartedAt: string;
  syncCompletedAt: string | null;
  /** Elapsed sync duration in milliseconds; null while running. */
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WalletInventoryErrorCode =
  | "wallet_not_found"
  | "wallet_not_verified"
  | "wallet_pending"
  | "wallet_revoked"
  | "wallet_disconnected"
  | "unsupported_namespace"
  | "provider_missing"
  | "sync_failed";

export class WalletInventoryError extends Error {
  readonly code: WalletInventoryErrorCode;

  constructor(code: WalletInventoryErrorCode, message: string) {
    super(message);
    this.name = "WalletInventoryError";
    this.code = code;
  }
}

export class InventoryWalletNotFoundError extends WalletInventoryError {
  constructor(message = "Profile wallet not found for inventory sync.") {
    super("wallet_not_found", message);
    this.name = "InventoryWalletNotFoundError";
  }
}

export class WalletNotVerifiedError extends WalletInventoryError {
  constructor(message = "Only verified wallets may synchronize inventory.") {
    super("wallet_not_verified", message);
    this.name = "WalletNotVerifiedError";
  }
}

export class WalletPendingError extends WalletInventoryError {
  constructor(message = "Pending wallets may not synchronize inventory.") {
    super("wallet_pending", message);
    this.name = "WalletPendingError";
  }
}

export class WalletRevokedError extends WalletInventoryError {
  constructor(message = "Revoked wallets may not synchronize inventory.") {
    super("wallet_revoked", message);
    this.name = "WalletRevokedError";
  }
}

export class WalletDisconnectedError extends WalletInventoryError {
  constructor(message = "Disconnected wallets may not synchronize inventory.") {
    super("wallet_disconnected", message);
    this.name = "WalletDisconnectedError";
  }
}

export class InventoryUnsupportedNamespaceError extends WalletInventoryError {
  constructor(namespace: string) {
    super(
      "unsupported_namespace",
      `Unsupported wallet chain namespace for inventory: ${namespace}`
    );
    this.name = "InventoryUnsupportedNamespaceError";
  }
}

export class InventoryProviderMissingError extends WalletInventoryError {
  constructor(namespace: string) {
    super(
      "provider_missing",
      `No inventory provider registered for namespace: ${namespace}`
    );
    this.name = "InventoryProviderMissingError";
  }
}

export class InventorySyncFailedError extends WalletInventoryError {
  constructor(message = "Wallet inventory synchronization failed.") {
    super("sync_failed", message);
    this.name = "InventorySyncFailedError";
  }
}

export function isKnownAssetStandard(value: string): value is AssetStandard {
  return (KNOWN_ASSET_STANDARDS as readonly string[]).includes(value);
}

export function coerceAssetStandard(value: string | null | undefined): AssetStandard {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  if (isKnownAssetStandard(normalized)) return normalized;
  // Accept common aliases from providers without rejecting.
  if (normalized === "spl_nft" || normalized === "metaplex" || normalized === "nft") {
    return "solana_nft";
  }
  if (
    normalized === "programmable_nft" ||
    normalized === "pnft" ||
    normalized === "v1_pnft"
  ) {
    return "solana_pnft";
  }
  return "unknown";
}

/**
 * Stable collection identity independent of marketplace catalog IDs.
 * `collectionAddress` is the EVM contract or Solana verified collection /
 * mint address used for grouping (see normalize resolveCollectionAddress).
 * Enrichment of collection metadata belongs in a future PR.
 */
export function stableCollectionId(
  chainNamespace: WalletChainNamespace,
  collectionAddress: string
): string {
  return `${chainNamespace}:${collectionAddress}`;
}

export function holdingIdentityKey(
  holding: Pick<
    NormalizedHolding,
    "walletId" | "chainNamespace" | "contractAddress" | "tokenId"
  >
): string {
  return [
    holding.walletId,
    holding.chainNamespace,
    holding.contractAddress,
    holding.tokenId,
  ].join(":");
}

/**
 * Content equality for idempotent sync. Ignores id and all timestamps
 * (createdAt/updatedAt/lastSeenAt) so identical provider payloads cause
 * zero writes / zero timestamp churn.
 */
export function isHoldingUnchanged(
  existing: NormalizedHolding,
  next: Omit<NormalizedHolding, "id" | "createdAt" | "updatedAt">
): boolean {
  return (
    existing.walletId === next.walletId &&
    existing.chainNamespace === next.chainNamespace &&
    existing.contractAddress === next.contractAddress &&
    existing.tokenId === next.tokenId &&
    existing.assetStandard === next.assetStandard &&
    existing.quantity === next.quantity &&
    existing.collectionId === next.collectionId &&
    existing.ownerAddress === next.ownerAddress &&
    existing.acquiredAt === next.acquiredAt &&
    existing.sourceProvider === next.sourceProvider
  );
}

export function computeSyncDurationMs(
  syncStartedAt: string,
  syncCompletedAt: string
): number {
  const started = Date.parse(syncStartedAt);
  const completed = Date.parse(syncCompletedAt);
  if (Number.isNaN(started) || Number.isNaN(completed)) return 0;
  return Math.max(0, completed - started);
}
