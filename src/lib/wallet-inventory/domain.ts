import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * Minimal asset standards required for future collector analysis.
 * No rarity, floor, valuation, or metadata enrichment lives here.
 */
export type AssetStandard =
  | "erc721"
  | "erc1155"
  | "spl_nft"
  | "unknown";

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
 * Returns true when persisted holding fields that matter for inventory
 * equality are unchanged (ignores id/timestamps for comparison callers).
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
