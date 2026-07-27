import { env } from "@/lib/env";
import type { EvmProviderNftHolding } from "@/lib/wallet-inventory/adapters/evm";

export const ALCHEMY_ETHEREUM_MAINNET_NETWORK = "eth-mainnet" as const;

const DEFAULT_PAGE_SIZE = 100;
const ALCHEMY_NFT_API_BASE_PATH = "nft/v3";

type AlchemyOwnedNft = {
  contract?: { address?: string; tokenType?: string };
  tokenId?: string;
  id?: { tokenId?: string; tokenMetadata?: { tokenType?: string } };
  tokenType?: string;
  balance?: string | number;
  collection?: { id?: string; slug?: string };
  acquiredAt?: { blockTimestamp?: string } | string;
};

type AlchemyOwnedNftsResponse = {
  ownedNfts?: AlchemyOwnedNft[];
  pageKey?: string;
  error?: unknown;
};

export interface CreateAlchemyEvmRawHoldingsFetcherOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resolveAlchemyError(payload: unknown): string | null {
  if (!isRecord(payload) || !("error" in payload)) {
    return null;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (isRecord(error)) {
    const code = typeof error.code === "number" ? error.code : null;
    const message =
      typeof error.message === "string" ? error.message.trim() : null;
    if (code != null && message) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (code != null) {
      return String(code);
    }
  }

  return "Alchemy returned an error payload.";
}

function buildAlchemyNftsForOwnerUrl(input: {
  apiKey: string;
  ownerAddress: string;
  pageSize: number;
  pageKey?: string;
}): string {
  const url = new URL(
    `https://${ALCHEMY_ETHEREUM_MAINNET_NETWORK}.g.alchemy.com/${ALCHEMY_NFT_API_BASE_PATH}/${input.apiKey}/getNFTsForOwner`
  );
  url.searchParams.set("owner", input.ownerAddress);
  url.searchParams.set("withMetadata", "true");
  url.searchParams.set("pageSize", String(input.pageSize));
  if (input.pageKey) {
    url.searchParams.set("pageKey", input.pageKey);
  }
  return url.toString();
}

function toEvmRawHolding(item: AlchemyOwnedNft): EvmProviderNftHolding {
  const tokenType =
    item.tokenType ?? item.contract?.tokenType ?? item.id?.tokenMetadata?.tokenType;
  return {
    contract: {
      address: item.contract?.address,
      tokenType,
    },
    contractAddress: item.contract?.address,
    tokenId: item.tokenId ?? item.id?.tokenId,
    id: { tokenId: item.id?.tokenId ?? item.tokenId },
    tokenType,
    balance: item.balance,
    collection: item.collection
      ? { id: item.collection.id, slug: item.collection.slug }
      : undefined,
    acquiredAt: item.acquiredAt,
  };
}

export function createAlchemyEvmRawHoldingsFetcher(
  options: CreateAlchemyEvmRawHoldingsFetcherOptions = {}
): (ownerAddress: string) => Promise<readonly EvmProviderNftHolding[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  return async function fetchAlchemyEvmRawHoldings(
    ownerAddress: string
  ): Promise<readonly EvmProviderNftHolding[]> {
    const apiKey = options.apiKey ?? env.ALCHEMY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ALCHEMY_API_KEY is required for wallet inventory EVM sync."
      );
    }

    const allItems: EvmProviderNftHolding[] = [];
    const seenPageKeys = new Set<string>();
    let pageKey: string | undefined;

    while (true) {
      const endpoint = buildAlchemyNftsForOwnerUrl({
        apiKey,
        ownerAddress,
        pageSize,
        pageKey,
      });

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
      } catch (cause) {
        const detail =
          cause instanceof Error ? cause.message : "Unknown network failure";
        throw new Error(`Alchemy getNFTsForOwner network failure: ${detail}`);
      }

      if (!response.ok) {
        throw new Error(`Alchemy getNFTsForOwner failed with HTTP ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Alchemy getNFTsForOwner returned non-JSON response.");
      }

      const alchemyError = resolveAlchemyError(payload);
      if (alchemyError) {
        throw new Error(`Alchemy getNFTsForOwner error: ${alchemyError}`);
      }

      if (!isRecord(payload)) {
        throw new Error("Alchemy getNFTsForOwner returned malformed payload.");
      }

      const typed = payload as AlchemyOwnedNftsResponse;
      if (!Array.isArray(typed.ownedNfts)) {
        throw new Error(
          "Alchemy getNFTsForOwner payload missing ownedNfts array."
        );
      }

      for (const item of typed.ownedNfts) {
        allItems.push(toEvmRawHolding(item));
      }

      const nextPageKey =
        typeof typed.pageKey === "string" && typed.pageKey.trim()
          ? typed.pageKey.trim()
          : null;
      if (!nextPageKey) {
        break;
      }
      if (seenPageKeys.has(nextPageKey)) {
        throw new Error(
          "Alchemy getNFTsForOwner pagination failure: duplicate pageKey."
        );
      }
      seenPageKeys.add(nextPageKey);
      pageKey = nextPageKey;
    }

    return Object.freeze(allItems);
  };
}
