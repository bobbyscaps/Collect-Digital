import { getProviderCache, setProviderCache } from "@/lib/providers/cache";
import type {
  NftDataProvider,
  NormalizedCollection,
  NormalizedHistoricalPoint,
  NormalizedListing,
  NormalizedOffer,
  NormalizedPortfolioValue,
  NormalizedSale,
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

  async getPortfolioValue(): Promise<NormalizedPortfolioValue | null> {
    return null;
  }

  async getHistoricalData(): Promise<NormalizedHistoricalPoint[]> {
    return [];
  }
}
