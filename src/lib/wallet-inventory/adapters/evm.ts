import type { AssetStandard } from "@/lib/wallet-inventory/domain";
import type {
  FetchWalletInventoryRequest,
  FetchWalletInventoryResult,
  ProviderInventoryItem,
  WalletInventoryProvider,
} from "@/lib/wallet-inventory/providers";

/**
 * Minimal EVM-shaped provider payload. Adapters convert this (or live API
 * responses mapped into this shape) into ProviderInventoryItem before any
 * business logic sees the data.
 */
export interface EvmProviderNftHolding {
  contract?: { address?: string; tokenType?: string };
  contractAddress?: string;
  tokenId?: string;
  id?: { tokenId?: string };
  tokenType?: string;
  balance?: string | number;
  collection?: { id?: string; slug?: string };
  acquiredAt?: { blockTimestamp?: string } | string;
}

function mapEvmAssetStandard(tokenType: string): AssetStandard {
  const normalized = tokenType.trim().toUpperCase();
  if (normalized === "ERC1155") return "erc1155";
  if (normalized === "ERC721") return "erc721";
  return "unknown";
}

export function normalizeEvmProviderHolding(
  raw: EvmProviderNftHolding
): ProviderInventoryItem | null {
  const contractAddress = (
    raw.contractAddress ??
    raw.contract?.address ??
    ""
  ).trim();
  const tokenId = String(raw.tokenId ?? raw.id?.tokenId ?? "").trim();
  if (!contractAddress || !tokenId) {
    return null;
  }

  const acquiredAt =
    typeof raw.acquiredAt === "string"
      ? raw.acquiredAt
      : raw.acquiredAt?.blockTimestamp ?? null;

  return {
    contractAddress,
    tokenId,
    assetStandard: mapEvmAssetStandard(
      raw.tokenType ?? raw.contract?.tokenType ?? ""
    ),
    quantity: String(raw.balance ?? "1"),
    // Provider collection IDs/slugs are intentionally dropped.
    collectionId: null,
    acquiredAt,
  };
}

export function normalizeEvmProviderHoldings(
  rawHoldings: readonly EvmProviderNftHolding[]
): ProviderInventoryItem[] {
  const items: ProviderInventoryItem[] = [];
  for (const raw of rawHoldings) {
    const item = normalizeEvmProviderHolding(raw);
    if (item) items.push(item);
  }
  return items;
}

export interface CreateEvmInventoryProviderOptions {
  providerKey?: string;
  /**
   * Fetch function returning EVM-shaped raw holdings for an owner address.
   * Defaults to an empty list (foundation stub — no live upstream calls).
   * Must return the complete page set or throw; partial failures must throw
   * so stale cleanup never runs on incomplete inventory.
   */
  fetchRawHoldings?: (
    ownerAddress: string
  ) => Promise<readonly EvmProviderNftHolding[]>;
}

export function createEvmInventoryProvider(
  options: CreateEvmInventoryProviderOptions = {}
): WalletInventoryProvider {
  const providerKey = options.providerKey ?? "evm_inventory";
  const fetchRawHoldings =
    options.fetchRawHoldings ?? (async () => Object.freeze([]));

  return {
    providerKey,
    chainNamespace: "eip155",
    async fetchHoldings(
      request: FetchWalletInventoryRequest
    ): Promise<FetchWalletInventoryResult> {
      if (request.chainNamespace !== "eip155") {
        throw new Error(
          `EVM inventory provider cannot serve namespace ${request.chainNamespace}`
        );
      }
      const raw = await fetchRawHoldings(request.ownerAddress);
      return {
        provider: providerKey,
        items: Object.freeze(normalizeEvmProviderHoldings(raw)),
      };
    },
  };
}
