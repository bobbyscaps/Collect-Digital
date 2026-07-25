import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import { normalizeWalletAddress } from "@/lib/profile-wallets/normalization";
import type {
  AssetStandard,
  NormalizedHolding,
} from "@/lib/wallet-inventory/domain";
import type { ProviderInventoryItem } from "@/lib/wallet-inventory/providers";

export interface NormalizeHoldingContext {
  wallet: ProfileWallet;
  sourceProvider: string;
  lastSeenAt: string;
}

function normalizeContractAddress(
  chainNamespace: ProfileWallet["chainNamespace"],
  contractAddress: string
): string {
  const cleaned = contractAddress.trim();
  if (!cleaned) {
    throw new Error("Holding contractAddress cannot be empty.");
  }
  if (chainNamespace === "eip155") {
    return cleaned.toLowerCase();
  }
  return cleaned;
}

function normalizeTokenId(tokenId: string): string {
  const cleaned = tokenId.trim();
  if (!cleaned) {
    throw new Error("Holding tokenId cannot be empty.");
  }
  return cleaned;
}

function normalizeQuantity(quantity: string): string {
  const cleaned = quantity.trim();
  if (!cleaned) {
    return "1";
  }
  // Reject non-positive / non-numeric quantities early.
  if (!/^\d+(\.\d+)?$/.test(cleaned) || Number(cleaned) <= 0) {
    throw new Error(`Invalid holding quantity: ${quantity}`);
  }
  return cleaned;
}

function normalizeAssetStandard(value: AssetStandard): AssetStandard {
  if (
    value === "erc721" ||
    value === "erc1155" ||
    value === "spl_nft" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

/**
 * Maps a provider-independent inventory item into the internal holding model.
 * Does not enrich metadata, rarity, floor, or valuation.
 */
export function normalizeProviderHolding(
  item: ProviderInventoryItem,
  context: NormalizeHoldingContext
): Omit<NormalizedHolding, "id" | "createdAt" | "updatedAt"> {
  const ownerAddress = normalizeWalletAddress(
    context.wallet.chainNamespace,
    context.wallet.address
  );

  return {
    walletId: context.wallet.id,
    chainNamespace: context.wallet.chainNamespace,
    contractAddress: normalizeContractAddress(
      context.wallet.chainNamespace,
      item.contractAddress
    ),
    tokenId: normalizeTokenId(item.tokenId),
    assetStandard: normalizeAssetStandard(item.assetStandard),
    quantity: normalizeQuantity(item.quantity),
    collectionId: item.collectionId?.trim() ? item.collectionId.trim() : null,
    ownerAddress,
    acquiredAt: item.acquiredAt ?? null,
    lastSeenAt: context.lastSeenAt,
    sourceProvider: context.sourceProvider,
  };
}

export function normalizeProviderHoldings(
  items: readonly ProviderInventoryItem[],
  context: NormalizeHoldingContext
): Array<Omit<NormalizedHolding, "id" | "createdAt" | "updatedAt">> {
  return items.map((item) => normalizeProviderHolding(item, context));
}
