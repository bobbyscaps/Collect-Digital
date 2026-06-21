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

const OPENSEA_BASE_URL = "https://api.opensea.io/api/v2";
const CACHE_TTL_MS = 1000 * 60 * 15;

export class OpenSeaProvider implements NftDataProvider {
  readonly name = "opensea" as const;

  constructor(private readonly apiKey?: string) {}

  private async fetchJson<T>(path: string): Promise<T> {
    const cacheKey = `provider:opensea:${path}`;
    const cached = await getProviderCache<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${OPENSEA_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      next: { revalidate: Math.floor(CACHE_TTL_MS / 1000) },
    });
    if (!response.ok) {
      throw new Error(`OpenSea API error ${response.status}`);
    }
    const data = (await response.json()) as T;
    await setProviderCache(cacheKey, data, CACHE_TTL_MS, this.name);
    return data;
  }

  async getCollection(collectionId: string): Promise<NormalizedCollection | null> {
    try {
      type Response = {
        collection: {
          collection?: string;
          name: string;
          image_url?: string;
          description?: string;
          banner_image_url?: string;
          project_url?: string;
          twitter_username?: string;
          discord_url?: string;
          telegram_url?: string;
          opensea_url?: string;
          contracts?: { address: string; chain: string }[];
        };
      };
      const data = await this.fetchJson<Response>(`/collections/${collectionId}`);
      const c = data.collection;
      const slug = c.collection ?? collectionId;
      return {
        id: slug,
        slug,
        name: c.name,
        image: c.image_url ?? "",
        floor: 0,
        topOffer: 0,
        holders: 0,
        sales: 0,
        liquidity: 0,
        listedPercent: 0,
        volume: 0,
        metadata: {
          description: c.description ?? null,
          bannerImage: c.banner_image_url ?? null,
          website: c.project_url ?? null,
          xUrl: c.twitter_username ? `https://x.com/${c.twitter_username}` : null,
          discordUrl: c.discord_url ?? null,
          telegramUrl: c.telegram_url ?? null,
          openseaUrl: c.opensea_url ?? `https://opensea.io/collection/${slug}`,
          contractAddress: c.contracts?.[0]?.address ?? null,
          chain: c.contracts?.[0]?.chain ?? "ethereum",
        },
        provider: "opensea",
      };
    } catch {
      return null;
    }
  }

  async searchCollections(query: string, options?: ProviderQueryOptions) {
    try {
      if (!query.trim()) {
        return [];
      }
      type Response = {
        collections: {
          collection?: string;
          slug?: string;
          name: string;
          image_url?: string;
          description?: string;
        }[];
      };
      const limit = options?.limit ?? 20;
      const data = await this.fetchJson<Response>(
        `/collections?chain=ethereum&limit=${limit}&name=${encodeURIComponent(query)}`
      );
      return (data.collections ?? []).map((item) => {
        const slug = item.slug ?? item.collection ?? item.name.toLowerCase().replace(/\s+/g, "-");
        return {
          id: slug,
          slug,
          name: item.name,
          image: item.image_url ?? "",
          floor: 0,
          topOffer: 0,
          holders: 0,
          sales: 0,
          liquidity: 0,
          listedPercent: 0,
          volume: 0,
          metadata: {
            description: item.description ?? null,
            openseaUrl: `https://opensea.io/collection/${slug}`,
          },
          provider: "opensea" as const,
        };
      });
    } catch {
      return [];
    }
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

  async getWalletNFTs(): Promise<NormalizedWalletNft[]> {
    return [];
  }

  async getPortfolioValue(): Promise<NormalizedPortfolioValue | null> {
    return null;
  }

  async getHistoricalData(): Promise<NormalizedHistoricalPoint[]> {
    return [];
  }
}
