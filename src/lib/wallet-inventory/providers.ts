import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { AssetStandard } from "@/lib/wallet-inventory/domain";

/**
 * Provider-independent inventory item produced by adapters.
 * Business logic and persistence must consume this shape — never raw
 * Alchemy/Helius/etc. response models.
 */
export interface ProviderInventoryItem {
  contractAddress: string;
  tokenId: string;
  assetStandard: AssetStandard;
  quantity: string;
  collectionId: string | null;
  acquiredAt: string | null;
}

export interface FetchWalletInventoryRequest {
  chainNamespace: WalletChainNamespace;
  ownerAddress: string;
}

export interface FetchWalletInventoryResult {
  provider: string;
  items: readonly ProviderInventoryItem[];
}

/**
 * Chain-namespace inventory provider. Adapters wrap concrete upstream APIs
 * and return only ProviderInventoryItem values.
 */
export interface WalletInventoryProvider {
  readonly providerKey: string;
  readonly chainNamespace: WalletChainNamespace;
  fetchHoldings(
    request: FetchWalletInventoryRequest
  ): Promise<FetchWalletInventoryResult>;
}

export interface WalletInventoryProviderRegistry {
  get(chainNamespace: WalletChainNamespace): WalletInventoryProvider | null;
  list(): readonly WalletInventoryProvider[];
}

export function createWalletInventoryProviderRegistry(
  providers: readonly WalletInventoryProvider[]
): WalletInventoryProviderRegistry {
  const byNamespace = new Map<WalletChainNamespace, WalletInventoryProvider>();
  for (const provider of providers) {
    byNamespace.set(provider.chainNamespace, provider);
  }

  return {
    get(chainNamespace: WalletChainNamespace) {
      return byNamespace.get(chainNamespace) ?? null;
    },
    list() {
      return Object.freeze([...providers]);
    },
  };
}
