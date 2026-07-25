import type {
  FetchWalletInventoryRequest,
  FetchWalletInventoryResult,
  ProviderInventoryItem,
  WalletInventoryProvider,
} from "@/lib/wallet-inventory/providers";

/**
 * Minimal Solana-shaped provider payload. Adapters convert this into
 * ProviderInventoryItem before business logic or persistence.
 */
export interface SolanaProviderNftHolding {
  mint?: string;
  tokenAddress?: string;
  id?: string;
  amount?: string | number;
  collection?: { key?: string; address?: string } | string;
  acquiredAt?: string | null;
  interface?: string;
}

export function normalizeSolanaProviderHolding(
  raw: SolanaProviderNftHolding
): ProviderInventoryItem | null {
  const mint = (raw.mint ?? raw.tokenAddress ?? raw.id ?? "").trim();
  if (!mint) {
    return null;
  }

  let collectionId: string | null = null;
  if (typeof raw.collection === "string") {
    collectionId = raw.collection.trim() || null;
  } else if (raw.collection) {
    collectionId =
      raw.collection.key?.trim() ||
      raw.collection.address?.trim() ||
      null;
  }

  return {
    // Solana NFTs are mint-address keyed; contractAddress stores the mint.
    contractAddress: mint,
    // Fungible/compressed variants may share a mint; tokenId mirrors mint
    // for 1/1 NFTs so the unique key remains stable.
    tokenId: mint,
    assetStandard: "spl_nft",
    quantity: String(raw.amount ?? "1"),
    collectionId,
    acquiredAt: raw.acquiredAt ?? null,
  };
}

export function normalizeSolanaProviderHoldings(
  rawHoldings: readonly SolanaProviderNftHolding[]
): ProviderInventoryItem[] {
  const items: ProviderInventoryItem[] = [];
  for (const raw of rawHoldings) {
    const item = normalizeSolanaProviderHolding(raw);
    if (item) items.push(item);
  }
  return items;
}

export interface CreateSolanaInventoryProviderOptions {
  providerKey?: string;
  fetchRawHoldings?: (
    ownerAddress: string
  ) => Promise<readonly SolanaProviderNftHolding[]>;
}

export function createSolanaInventoryProvider(
  options: CreateSolanaInventoryProviderOptions = {}
): WalletInventoryProvider {
  const providerKey = options.providerKey ?? "solana_inventory";
  const fetchRawHoldings =
    options.fetchRawHoldings ?? (async () => Object.freeze([]));

  return {
    providerKey,
    chainNamespace: "solana",
    async fetchHoldings(
      request: FetchWalletInventoryRequest
    ): Promise<FetchWalletInventoryResult> {
      if (request.chainNamespace !== "solana") {
        throw new Error(
          `Solana inventory provider cannot serve namespace ${request.chainNamespace}`
        );
      }
      const raw = await fetchRawHoldings(request.ownerAddress);
      return {
        provider: providerKey,
        items: Object.freeze(normalizeSolanaProviderHoldings(raw)),
      };
    },
  };
}
