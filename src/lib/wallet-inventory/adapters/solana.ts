import { coerceAssetStandard, type AssetStandard } from "@/lib/wallet-inventory/domain";
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
  tokenStandard?: string;
}

function mapSolanaAssetStandard(raw: SolanaProviderNftHolding): AssetStandard {
  const hint = `${raw.interface ?? ""} ${raw.tokenStandard ?? ""}`.toLowerCase();
  if (
    hint.includes("programmable") ||
    hint.includes("pnft") ||
    hint.includes("v1_pnft")
  ) {
    return "solana_pnft";
  }
  if (
    hint.includes("nonfungible") ||
    hint.includes("metaplex") ||
    hint.includes("nft") ||
    hint.includes("standard")
  ) {
    return "solana_nft";
  }
  if (!raw.interface && !raw.tokenStandard) {
    // Default mint holdings without a hint are treated as standard Solana NFTs.
    return "solana_nft";
  }
  return coerceAssetStandard(raw.tokenStandard ?? raw.interface);
}

export function normalizeSolanaProviderHolding(
  raw: SolanaProviderNftHolding
): ProviderInventoryItem | null {
  const mint = (raw.mint ?? raw.tokenAddress ?? raw.id ?? "").trim();
  if (!mint) {
    return null;
  }

  return {
    // Solana NFTs are mint-address keyed; contractAddress stores the mint.
    contractAddress: mint,
    // 1/1 NFTs use mint as tokenId so the unique key remains stable.
    tokenId: mint,
    assetStandard: mapSolanaAssetStandard(raw),
    quantity: String(raw.amount ?? "1"),
    // Provider collection keys/addresses are intentionally dropped.
    collectionId: null,
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
  /**
   * Must return the complete inventory or throw. Partial upstream failures
   * must throw so callers never run stale cleanup on incomplete data.
   */
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
