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

function looksLikeContractAddress(value: string) {
  return /^0x[a-f0-9]{40}$/i.test(value.trim());
}

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

  private async resolveCollectionFromContract(
    contractAddress: string
  ): Promise<string | null> {
    try {
      type Response = {
        nfts?: {
          collection?: string | { slug?: string };
        }[];
      };
      const data = await this.fetchJson<Response>(
        `/chain/ethereum/contract/${contractAddress}/nfts?limit=1`
      );
      const firstNft = data.nfts?.[0];
      if (!firstNft?.collection) {
        return null;
      }
      if (typeof firstNft.collection === "string") {
        return firstNft.collection;
      }
      return firstNft.collection.slug ?? null;
    } catch {
      return null;
    }
  }

  async getCollection(collectionId: string): Promise<NormalizedCollection | null> {
    try {
      let lookupId = collectionId.trim();
      if (looksLikeContractAddress(lookupId)) {
        const resolved = await this.resolveCollectionFromContract(lookupId);
        if (resolved) {
          lookupId = resolved;
        }
      }

      type Response = {
        collection?: string;
        name?: string;
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
      type StatsResponse = {
        total?: {
          volume?: number;
          sales?: number;
          num_owners?: number;
          floor_price?: number;
        };
      };
      const [dataResult, statsResult] = await Promise.allSettled([
        this.fetchJson<Response>(`/collections/${lookupId}`),
        this.fetchJson<StatsResponse>(`/collections/${lookupId}/stats`),
      ]);

      if (dataResult.status !== "fulfilled") {
        return null;
      }

      const data = dataResult.value;
      const stats =
        statsResult.status === "fulfilled" ? statsResult.value.total : undefined;
      const slug = data.collection ?? lookupId;
      return {
        id: slug,
        slug,
        name: data.name ?? slug,
        image: data.image_url ?? "",
        floor: Number(stats?.floor_price ?? 0),
        topOffer: Number(stats?.floor_price ?? 0) * 0.9,
        holders: Number(stats?.num_owners ?? 0),
        sales: Number(stats?.sales ?? 0),
        liquidity: Number(stats?.floor_price ?? 0) * Math.max(Number(stats?.sales ?? 0), 1),
        listedPercent: 0,
        volume: Number(stats?.volume ?? 0),
        metadata: {
          description: data.description ?? null,
          bannerImage: data.banner_image_url ?? null,
          website: data.project_url ?? null,
          xUrl: data.twitter_username ? `https://x.com/${data.twitter_username}` : null,
          discordUrl: data.discord_url ?? null,
          telegramUrl: data.telegram_url ?? null,
          openseaUrl: data.opensea_url ?? `https://opensea.io/collection/${slug}`,
          contractAddress: data.contracts?.[0]?.address ?? null,
          chain: data.contracts?.[0]?.chain ?? "ethereum",
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
