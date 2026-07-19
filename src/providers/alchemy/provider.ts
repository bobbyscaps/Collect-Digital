import { getProviderCache, setProviderCache } from "@/lib/providers/cache";
import type {
  NftDataProvider,
  NormalizedCollection,
  NormalizedHeldToken,
  NormalizedHistoricalPoint,
  NormalizedListing,
  NormalizedOffer,
  NormalizedPortfolioValue,
  NormalizedSale,
  NormalizedWalletActivity,
  NormalizedWalletNft,
  ProviderQueryOptions,
} from "@/providers/types";

const ALCHEMY_NETWORK = "eth-mainnet";
const CACHE_TTL_MS = 1000 * 60 * 5;

export class AlchemyProvider implements NftDataProvider {
  readonly name = "alchemy" as const;

  constructor(private readonly apiKey?: string) {}

  private get nftApiBaseUrl() {
    if (!this.apiKey) {
      return null;
    }
    return `https://${ALCHEMY_NETWORK}.g.alchemy.com/nft/v3/${this.apiKey}`;
  }

  private async fetchJson<T>(path: string, ttlMs = CACHE_TTL_MS): Promise<T> {
    if (!this.nftApiBaseUrl) {
      throw new Error("Alchemy API key missing");
    }

    const cacheKey = `provider:alchemy:${path}`;
    const cached = await getProviderCache<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${this.nftApiBaseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: Math.max(60, Math.floor(ttlMs / 1000)) },
    });

    if (!response.ok) {
      throw new Error(`Alchemy API error ${response.status}`);
    }

    const data = (await response.json()) as T;
    await setProviderCache(cacheKey, data, ttlMs, this.name);
    return data;
  }

  async getCollection(): Promise<NormalizedCollection | null> {
    return null;
  }

  async searchCollections(): Promise<NormalizedCollection[]> {
    return [];
  }

  async getCollectionStats(): Promise<NormalizedCollection | null> {
    return null;
  }

  async getFloorPrice(): Promise<number | null> {
    return null;
  }

  async getListings(): Promise<NormalizedListing[]> {
    return [];
  }

  async getOffers(): Promise<NormalizedOffer[]> {
    return [];
  }

  async getSales(): Promise<NormalizedSale[]> {
    return [];
  }

  async getWalletNFTs(
    walletAddress: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedWalletNft[]> {
    try {
      type Response = {
        ownedNfts: {
          tokenId: string;
          contract: { address: string };
          image?: { cachedUrl?: string };
          collection?: { slug?: string; name?: string };
          name?: string;
          balance?: string;
        }[];
      };

      const pageSize = options?.limit ?? 100;
      const data = await this.fetchJson<Response>(
        `/getNFTsForOwner?owner=${walletAddress}&withMetadata=true&pageSize=${pageSize}`
      );

      return (data.ownedNfts ?? []).map((nft) => {
        const slug =
          nft.collection?.slug ??
          nft.collection?.name?.toLowerCase().replace(/\s+/g, "-") ??
          nft.contract.address;

        return {
          contractAddress: nft.contract.address,
          tokenId: nft.tokenId,
          collectionId: slug,
          collectionSlug: slug,
          collectionName: nft.collection?.name ?? slug,
          image: nft.image?.cachedUrl,
          quantity: Number(nft.balance ?? "1"),
        };
      });
    } catch {
      return [];
    }
  }

  /** Current holdings with acquisition time and collection floor. */
  async getUserTokens(
    address: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedHeldToken[]> {
    try {
      type Response = {
        ownedNfts: {
          contract?: {
            address?: string;
            name?: string;
            openSeaMetadata?: { floorPrice?: number; collectionName?: string };
          };
          collection?: { name?: string };
          acquiredAt?: { blockTimestamp?: string };
        }[];
        pageKey?: string;
      };

      const target = Math.min(options?.limit ?? 200, 400);
      const held: NormalizedHeldToken[] = [];
      let pageKey: string | undefined;
      let pages = 0;

      do {
        const data = await this.fetchJson<Response>(
          `/getNFTsForOwner?owner=${address}&withMetadata=true&orderBy=transferTime&pageSize=100${
            pageKey ? `&pageKey=${encodeURIComponent(pageKey)}` : ""
          }`
        );
        for (const nft of data.ownedNfts ?? []) {
          held.push({
            collectionId: String(nft.contract?.address ?? "unknown"),
            collectionName: String(
              nft.contract?.name ??
                nft.collection?.name ??
                nft.contract?.openSeaMetadata?.collectionName ??
                "Unknown"
            ),
            acquiredAt: nft.acquiredAt?.blockTimestamp
              ? Date.parse(nft.acquiredAt.blockTimestamp)
              : 0,
            floorEth: Number(nft.contract?.openSeaMetadata?.floorPrice ?? 0),
          });
        }
        pageKey = data.pageKey;
        pages += 1;
      } while (pageKey && held.length < target && pages < 5);

      return held;
    } catch {
      return [];
    }
  }

  /** ERC-721/1155 transfer history (acquisitions, disposals, mints). */
  async getUserActivity(
    address: string
  ): Promise<NormalizedWalletActivity[]> {
    if (!this.apiKey) return [];
    const rpcUrl = `https://${ALCHEMY_NETWORK}.g.alchemy.com/v2/${this.apiKey}`;

    type Transfer = {
      from?: string;
      to?: string;
      category?: string;
      rawContract?: { address?: string };
      metadata?: { blockTimestamp?: string };
    };

    const fetchDirection = async (
      key: "fromAddress" | "toAddress"
    ): Promise<Transfer[]> => {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [
              {
                fromBlock: "0x0",
                toBlock: "latest",
                [key]: address,
                category: ["erc721", "erc1155"],
                withMetadata: true,
                excludeZeroValue: false,
                maxCount: "0x3e8",
                order: "desc",
              },
            ],
          }),
        });
        if (!response.ok) return [];
        const data = (await response.json()) as {
          result?: { transfers?: Transfer[] };
        };
        return data.result?.transfers ?? [];
      } catch {
        return [];
      }
    };

    const [received, sent] = await Promise.all([
      fetchDirection("toAddress"),
      fetchDirection("fromAddress"),
    ]);

    const zero = "0x0000000000000000000000000000000000000000";
    const toEvent = (transfer: Transfer): NormalizedWalletActivity => ({
      type: (transfer.from ?? "").toLowerCase() === zero ? "mint" : "transfer",
      timestamp: transfer.metadata?.blockTimestamp
        ? Date.parse(transfer.metadata.blockTimestamp)
        : 0,
      priceEth: 0,
      fromAddress: transfer.from?.toLowerCase(),
      toAddress: transfer.to?.toLowerCase(),
      collectionId: transfer.rawContract?.address?.toLowerCase(),
    });

    return [...received, ...sent].map(toEvent);
  }

  async getPortfolioValue(): Promise<NormalizedPortfolioValue | null> {
    return null;
  }

  async getHistoricalData(): Promise<NormalizedHistoricalPoint[]> {
    return [];
  }
}
