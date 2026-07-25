import type { ProfileWallet, WalletChainNamespace } from "@/lib/profile-wallets/domain";
import { normalizeWalletAddress } from "@/lib/profile-wallets/normalization";
import {
  coerceAssetStandard,
  stableCollectionId,
  type NormalizedHolding,
} from "@/lib/wallet-inventory/domain";
import type { ProviderInventoryItem } from "@/lib/wallet-inventory/providers";

export interface NormalizeHoldingContext {
  wallet: ProfileWallet;
  sourceProvider: string;
  lastSeenAt: string;
}

/**
 * EVM: lowercase. Solana: trim only (base58 is case-sensitive / already canonical).
 */
export function normalizeInventoryAddress(
  chainNamespace: WalletChainNamespace,
  address: string
): string {
  return normalizeWalletAddress(chainNamespace, address);
}

export function normalizeContractAddress(
  chainNamespace: WalletChainNamespace,
  contractAddress: string
): string {
  const cleaned = contractAddress.trim();
  if (!cleaned) {
    throw new Error("Holding contractAddress cannot be empty.");
  }
  if (chainNamespace === "eip155") {
    return cleaned.toLowerCase();
  }
  // Solana mint/program addresses: preserve canonical base58 casing.
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
  if (!/^\d+(\.\d+)?$/.test(cleaned) || Number(cleaned) <= 0) {
    throw new Error(`Invalid holding quantity: ${quantity}`);
  }
  return cleaned;
}

/**
 * Resolves the address component used for stable collection identity.
 *
 * - EVM: always the NFT contract address (adapter collectionId ignored —
 *   marketplace slugs/catalog ids must never become collection identity).
 * - Solana: Metaplex verified collection address when the adapter supplies
 *   one; otherwise the mint (per-mint singleton — documented PR5 limitation
 *   when no verified collection key is available).
 */
export function resolveCollectionAddress(
  chainNamespace: WalletChainNamespace,
  item: Pick<ProviderInventoryItem, "contractAddress" | "collectionId">,
  normalizedContractAddress: string
): string {
  if (chainNamespace === "solana") {
    const verifiedCollection = item.collectionId?.trim();
    if (verifiedCollection) {
      return normalizeContractAddress("solana", verifiedCollection);
    }
  }
  return normalizedContractAddress;
}

/**
 * Maps a provider-independent inventory item into the internal holding model.
 * Collection identity is `${chainNamespace}:${collectionAddress}` where
 * collectionAddress comes from resolveCollectionAddress(...).
 */
export function normalizeProviderHolding(
  item: ProviderInventoryItem,
  context: NormalizeHoldingContext
): Omit<NormalizedHolding, "id" | "createdAt" | "updatedAt"> {
  const ownerAddress = normalizeInventoryAddress(
    context.wallet.chainNamespace,
    context.wallet.address
  );
  const contractAddress = normalizeContractAddress(
    context.wallet.chainNamespace,
    item.contractAddress
  );
  const collectionAddress = resolveCollectionAddress(
    context.wallet.chainNamespace,
    item,
    contractAddress
  );

  return {
    walletId: context.wallet.id,
    chainNamespace: context.wallet.chainNamespace,
    contractAddress,
    tokenId: normalizeTokenId(item.tokenId),
    assetStandard: coerceAssetStandard(item.assetStandard),
    quantity: normalizeQuantity(item.quantity),
    collectionId: stableCollectionId(
      context.wallet.chainNamespace,
      collectionAddress
    ),
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
