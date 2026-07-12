import type {
  NftDataProvider,
  NormalizedCollection,
  NormalizedHistoricalPoint,
  NormalizedListing,
  NormalizedOffer,
  NormalizedPortfolioValue,
  NormalizedSale,
  NormalizedWalletNft,
} from "@/providers/types";

const SIMPLEHASH_BASE_URL = "https://api.simplehash.com/api/v0";

export class SimpleHashProvider implements NftDataProvider {
  readonly name = "simplehash" as const;

  constructor(private readonly apiKey?: string) {}

  private get headers() {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "X-API-KEY": this.apiKey } : {}),
    };
  }

  async getCollection(collectionId: string): Promise<NormalizedCollection | null> {
    if (!this.apiKey) {
      return null;
    }
    try {
      type Response = {
        collections?: {
          collection_id: string;
          name?: string;
          image_url?: string;
          banner_image_url?: string;
          description?: string;
          external_url?: string;
          twitter_username?: string;
          discord_url?: string;
        }[];
      };
      const response = await fetch(
        `${SIMPLEHASH_BASE_URL}/nfts/collections?collection_ids=${encodeURIComponent(
          collectionId
        )}`,
        { headers: this.headers, next: { revalidate: 1800 } }
      );
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as Response;
      const collection = data.collections?.[0];
      if (!collection) {
        return null;
      }
      return {
        id: collection.collection_id,
        slug: collection.collection_id,
        name: collection.name ?? collection.collection_id,
        image: collection.image_url ?? "",
        floor: 0,
        topOffer: 0,
        holders: 0,
        sales: 0,
        liquidity: 0,
        listedPercent: 0,
        volume: 0,
        metadata: {
          description: collection.description ?? null,
          bannerImage: collection.banner_image_url ?? null,
          website: collection.external_url ?? null,
          xUrl: collection.twitter_username
            ? `https://x.com/${collection.twitter_username}`
            : null,
          discordUrl: collection.discord_url ?? null,
          chain: "ethereum",
        },
        provider: "simplehash",
      };
    } catch {
      return null;
    }
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
