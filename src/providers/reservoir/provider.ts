import { setProviderCache, getProviderCache } from "@/lib/providers/cache";
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

const RESERVOIR_BASE_URL = "https://api.reservoir.tools";
const CACHE_TTL_MS = 1000 * 60 * 15;

function looksLikeContractAddress(value: string) {
  return /^0x[a-f0-9]{40}$/i.test(value.trim());
}

function toEth(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Normalize a Reservoir timestamp (ISO string or unix seconds) to epoch ms. */
function toEpochMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Reservoir activity timestamps are unix seconds.
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  }
  return 0;
}

function toNormalizedCollection(collection: Record<string, unknown>): NormalizedCollection {
  const floor =
    toEth(
      (collection.floorAsk as { price?: { amount?: { native?: number } } } | undefined)
        ?.price?.amount?.native
    ) || toEth(collection.floorSellValue);
  const topBid = toEth(
    (collection.topBid as { price?: { amount?: { native?: number } } } | undefined)
      ?.price?.amount?.native
  );
  const volume =
    toEth((collection.volume as { "7day"?: number; allTime?: number } | undefined)?.["7day"]) ||
    toEth((collection.volume as { allTime?: number } | undefined)?.allTime);
  const tokenCount = toEth(collection.tokenCount) || 1;
  const listedCount = toEth(collection.onSaleCount);

  const id =
    String(collection.id ?? collection.slug ?? collection.name ?? "unknown-collection");
  return {
    id,
    slug: String(collection.slug ?? id),
    name: String(collection.name ?? id),
    image: String(collection.image ?? ""),
    floor,
    topOffer: topBid,
    holders: toEth(collection.ownerCount),
    sales: toEth(collection.salesCount),
    liquidity: topBid * Math.max(1, toEth(collection.salesCount) * 0.1),
    listedPercent: Math.max(0, Math.min(100, (listedCount / tokenCount) * 100)),
    volume,
    metadata: {
      description: String(collection.description ?? ""),
      bannerImage: String(collection.banner ?? ""),
      website: String(collection.externalUrl ?? ""),
      xUrl: collection.twitterUrl ? String(collection.twitterUrl) : null,
      discordUrl: collection.discordUrl ? String(collection.discordUrl) : null,
      telegramUrl: collection.telegramUrl ? String(collection.telegramUrl) : null,
      openseaUrl: collection.openseaVerificationStatus
        ? `https://opensea.io/collection/${String(collection.slug ?? id)}`
        : null,
      contractAddress: Array.isArray(collection.contracts)
        ? String(
            (
              collection.contracts as { address?: string }[]
            )[0]?.address ?? ""
          )
        : null,
      chain: "ethereum",
    },
    provider: "reservoir",
  };
}

export class ReservoirProvider implements NftDataProvider {
  readonly name = "reservoir" as const;

  constructor(private readonly apiKey?: string) {}

  private async fetchJson<T>(path: string, ttlMs = CACHE_TTL_MS): Promise<T> {
    const cacheKey = `provider:reservoir:${path}`;
    const cached = await getProviderCache<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${RESERVOIR_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      next: { revalidate: Math.max(60, Math.floor(ttlMs / 1000)) },
    });

    if (!response.ok) {
      throw new Error(`Reservoir API error ${response.status}`);
    }

    const data = (await response.json()) as T;
    await setProviderCache(cacheKey, data, ttlMs, this.name);
    return data;
  }

  async getCollection(collectionId: string): Promise<NormalizedCollection | null> {
    try {
      type Response = { collections: Record<string, unknown>[] };
      let data = await this.fetchJson<Response>(
        `/collections/v7?id=${encodeURIComponent(collectionId)}&includeTopBid=true`
      );

      if (!data.collections?.length) {
        data = await this.fetchJson<Response>(
          `/collections/v7?slug=${encodeURIComponent(collectionId)}&includeTopBid=true`
        );
      }

      if (!data.collections?.length && looksLikeContractAddress(collectionId)) {
        data = await this.fetchJson<Response>(
          `/collections/v7?contract=${encodeURIComponent(
            collectionId
          )}&includeTopBid=true`
        );
      }

      const collection = data.collections?.[0];
      return collection ? toNormalizedCollection(collection) : null;
    } catch {
      return null;
    }
  }

  async searchCollections(
    query: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedCollection[]> {
    try {
      if (!query.trim()) {
        return [];
      }

      type Response = { collections: Record<string, unknown>[] };
      const limit = options?.limit ?? 20;
      const data = await this.fetchJson<Response>(
        `/search/collections/v1?name=${encodeURIComponent(query)}&limit=${limit}`
      );

      return (data.collections ?? []).map(toNormalizedCollection);
    } catch {
      return [];
    }
  }

  async getCollectionStats(collectionId: string): Promise<NormalizedCollection | null> {
    return this.getCollection(collectionId);
  }

  async getFloorPrice(collectionId: string): Promise<number | null> {
    const collection = await this.getCollection(collectionId);
    return collection?.floor ?? null;
  }

  async getListings(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedListing[]> {
    try {
      type Response = { orders: Record<string, unknown>[] };
      const limit = options?.limit ?? 30;
      const data = await this.fetchJson<Response>(
        `/orders/asks/v5?collection=${encodeURIComponent(
          collectionId
        )}&sortBy=price&limit=${limit}`
      );
      return (data.orders ?? []).map((order) => ({
        tokenId: String(order.tokenSetId ?? "unknown"),
        priceEth: toEth(
          (
            order.price as { amount?: { native?: number } } | undefined
          )?.amount?.native
        ),
        marketplace: String(order.source?.toString() ?? ""),
        maker: String(order.maker ?? ""),
        createdAt: String(order.createdAt ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async getOffers(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedOffer[]> {
    try {
      type Response = { orders: Record<string, unknown>[] };
      const limit = options?.limit ?? 30;
      const data = await this.fetchJson<Response>(
        `/orders/bids/v6?collection=${encodeURIComponent(
          collectionId
        )}&sortBy=price&limit=${limit}`
      );
      return (data.orders ?? []).map((order) => ({
        tokenId: String(order.tokenSetId ?? ""),
        priceEth: toEth(
          (
            order.price as { amount?: { native?: number } } | undefined
          )?.amount?.native
        ),
        marketplace: String(order.source?.toString() ?? ""),
        maker: String(order.maker ?? ""),
        createdAt: String(order.createdAt ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async getSales(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedSale[]> {
    try {
      type Response = { sales: Record<string, unknown>[] };
      const limit = options?.limit ?? 50;
      const data = await this.fetchJson<Response>(
        `/sales/v6?collection=${encodeURIComponent(collectionId)}&limit=${limit}`
      );
      return (data.sales ?? []).map((sale) => ({
        tokenId: String(sale.token?.toString() ?? "unknown"),
        priceEth: toEth(
          (
            sale.price as { amount?: { native?: number } } | undefined
          )?.amount?.native
        ),
        marketplace: String(sale.orderSource?.toString() ?? ""),
        txHash: String(sale.txHash ?? ""),
        soldAt: String(sale.timestamp ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async getWalletNFTs(): Promise<NormalizedWalletNft[]> {
    return [];
  }

  /** Current NFT holdings for a wallet, including when each was acquired. */
  async getUserTokens(
    address: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedHeldToken[]> {
    try {
      type Response = {
        tokens: {
          token?: {
            collection?: {
              id?: string;
              name?: string;
              floorAskPrice?: { amount?: { native?: number } };
            };
          };
          ownership?: { acquiredAt?: string };
        }[];
        continuation?: string | null;
      };

      const pageLimit = Math.min(options?.limit ?? 200, 200);
      const held: NormalizedHeldToken[] = [];
      let continuation: string | null | undefined;
      let pages = 0;

      do {
        const query = `/users/${encodeURIComponent(address)}/tokens/v7?limit=${Math.min(
          pageLimit,
          50
        )}&sortBy=acquiredAt${continuation ? `&continuation=${continuation}` : ""}`;
        const data = await this.fetchJson<Response>(query);
        for (const entry of data.tokens ?? []) {
          const collection = entry.token?.collection;
          held.push({
            collectionId: String(collection?.id ?? "unknown"),
            collectionName: String(collection?.name ?? "Unknown"),
            acquiredAt: toEpochMs(entry.ownership?.acquiredAt),
            floorEth: toEth(collection?.floorAskPrice?.amount?.native),
          });
        }
        continuation = data.continuation;
        pages += 1;
      } while (continuation && held.length < pageLimit && pages < 5);

      return held;
    } catch {
      return [];
    }
  }

  /** Buy/sell/mint/transfer activity for a wallet, newest first. */
  async getUserActivity(
    address: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedWalletActivity[]> {
    try {
      type Response = {
        activities: {
          type?: string;
          timestamp?: number;
          price?: { amount?: { native?: number } } | number;
          fromAddress?: string;
          toAddress?: string;
          collection?: { collectionId?: string };
        }[];
        continuation?: string | null;
      };

      const target = Math.min(options?.limit ?? 500, 1000);
      const events: NormalizedWalletActivity[] = [];
      let continuation: string | null | undefined;
      let pages = 0;

      do {
        const query = `/users/${encodeURIComponent(
          address
        )}/activity/v6?limit=50&types=sale&types=mint&types=transfer${
          continuation ? `&continuation=${continuation}` : ""
        }`;
        const data = await this.fetchJson<Response>(query);
        for (const activity of data.activities ?? []) {
          const priceEth =
            typeof activity.price === "number"
              ? activity.price
              : toEth(activity.price?.amount?.native);
          events.push({
            type: String(activity.type ?? "unknown"),
            timestamp: toEpochMs(activity.timestamp),
            priceEth,
            fromAddress: activity.fromAddress?.toLowerCase(),
            toAddress: activity.toAddress?.toLowerCase(),
            collectionId: activity.collection?.collectionId,
          });
        }
        continuation = data.continuation;
        pages += 1;
      } while (continuation && events.length < target && pages < 20);

      return events;
    } catch {
      return [];
    }
  }

  async getPortfolioValue(): Promise<NormalizedPortfolioValue | null> {
    return null;
  }

  async getHistoricalData(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedHistoricalPoint[]> {
    try {
      type Response = {
        events: {
          createdAt: string;
          floorAskPrice?: number;
          volume?: number;
          salesCount?: number;
        }[];
      };
      const limit = options?.limit ?? 30;
      const data = await this.fetchJson<Response>(
        `/events/collections/floor-ask/v1?collection=${encodeURIComponent(
          collectionId
        )}&limit=${limit}`
      );

      return (data.events ?? []).map((event) => ({
        timestamp: event.createdAt,
        floorPriceEth: toEth(event.floorAskPrice),
        volumeEth: toEth(event.volume),
        salesCount: toEth(event.salesCount),
      }));
    } catch {
      return [];
    }
  }
}
