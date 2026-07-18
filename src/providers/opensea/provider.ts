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
const OPENSEA_WEB_BASE_URL = "https://opensea.io";
const CACHE_TTL_MS = 1000 * 60 * 15;

function looksLikeContractAddress(value: string) {
  return /^0x[a-f0-9]{40}$/i.test(value.trim());
}

function toSlugFromQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumericFromText(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^0-9.]+/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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

  private async fetchText(pathOrUrl: string): Promise<string> {
    const cacheKey = `provider:opensea:text:${pathOrUrl}`;
    const cached = await getProviderCache<string>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${OPENSEA_WEB_BASE_URL}${pathOrUrl}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "text/plain",
      },
      next: { revalidate: Math.floor(CACHE_TTL_MS / 1000) },
    });
    if (!response.ok) {
      throw new Error(`OpenSea page error ${response.status}`);
    }
    const text = await response.text();
    await setProviderCache(cacheKey, text, CACHE_TTL_MS, this.name);
    return text;
  }

  private async getCollectionFromMarkdown(collectionSlug: string) {
    try {
      const markdown = await this.fetchText(`/collection/${collectionSlug}.md`);
      if (!markdown || markdown.includes("Not Found")) {
        return null;
      }

      const lines = markdown.split("\n");
      const titleLine = lines.find((line) => line.startsWith("# "));
      const name = titleLine
        ? titleLine
            .replace(/^#\s+/, "")
            .replace(/\s+\(Verified\)\s*$/i, "")
            .trim()
        : collectionSlug;

      const floorLine = lines.find((line) => line.includes("**Floor Price:**"));
      const ownersLine = lines.find((line) => line.includes("**Owners:**"));
      const volume7dLine = lines.find((line) => line.includes("**7d Volume:**"));
      const aboutIndex = lines.findIndex((line) => line.trim() === "## About");
      const linksIndex = lines.findIndex((line) => line.trim() === "## Links");
      const description =
        aboutIndex >= 0
          ? lines
              .slice(aboutIndex + 1, linksIndex > aboutIndex ? linksIndex : undefined)
              .join(" ")
              .trim()
          : "";

      const websiteMatch = markdown.match(/\[Official Website\]\((https?:\/\/[^)]+)\)/i);
      const twitterMatch = markdown.match(/\[Twitter\]\((https?:\/\/[^)]+)\)/i);
      const discordMatch = markdown.match(/\[Discord\]\((https?:\/\/[^)]+)\)/i);

      let logoImage = "";
      let heroImage: string | null = null;
      try {
        const html = await this.fetchText(`/collection/${collectionSlug}`);
        const logoMatch = html.match(
          /https:\/\/i2c\.seadn\.io\/collection\/[^"' )]+image_type_logo[^"' )]+/i
        );
        const heroMatch = html.match(
          /https:\/\/i2c\.seadn\.io\/collection\/[^"' )]+image_type_hero_desktop[^"' )]+/i
        );
        logoImage = logoMatch?.[0] ?? "";
        heroImage = heroMatch?.[0] ?? null;
      } catch {
        // No-op; markdown fallback still valid without images.
      }

      return {
        id: collectionSlug,
        slug: collectionSlug,
        name,
        image: logoImage,
        floor: floorLine ? parseNumericFromText(floorLine) : 0,
        topOffer: floorLine ? parseNumericFromText(floorLine) * 0.9 : 0,
        holders: ownersLine ? parseNumericFromText(ownersLine) : 0,
        sales: 0,
        liquidity: floorLine ? parseNumericFromText(floorLine) : 0,
        listedPercent: 0,
        volume: volume7dLine ? parseNumericFromText(volume7dLine) : 0,
        metadata: {
          description: description || null,
          bannerImage: heroImage,
          website: websiteMatch?.[1] ?? null,
          xUrl: twitterMatch?.[1] ?? null,
          discordUrl: discordMatch?.[1] ?? null,
          telegramUrl: null,
          openseaUrl: `https://opensea.io/collection/${collectionSlug}`,
          contractAddress: null,
          chain: "ethereum",
        },
        provider: "opensea" as const,
      } satisfies NormalizedCollection;
    } catch {
      return null;
    }
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
        const markdownFallback = await this.getCollectionFromMarkdown(lookupId);
        return markdownFallback;
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
      const lookupSlug = toSlugFromQuery(collectionId);
      if (!lookupSlug) {
        return null;
      }
      return this.getCollectionFromMarkdown(lookupSlug);
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
      const mapped = (data.collections ?? []).map((item) => {
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
      if (mapped.length > 0) {
        return mapped;
      }
    } catch {
      // Fall through to slug guess fallback below.
    }

    try {
      const guess = toSlugFromQuery(query);
      if (!guess) {
        return [];
      }
      const guesses = [
        guess,
        guess.replace(/-nfts?$/, ""),
        `the-${guess.replace(/-nfts?$/, "")}`,
      ].filter(Boolean);
      const settled = await Promise.allSettled(
        guesses.map((slug) => this.getCollection(slug))
      );
      return settled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));
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
