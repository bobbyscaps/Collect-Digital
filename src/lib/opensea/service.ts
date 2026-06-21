import { env } from "@/lib/env";
import {
  DEFAULT_SCORING_VERSION,
  MOCK_COLLECTIONS,
  MOCK_PORTFOLIO,
} from "@/lib/mock-data";
import { TOP_OPENSEA_COLLECTION_SEEDS } from "@/lib/opensea/top-collections";
import { computeCollectionScore } from "@/lib/scoring/engine";
import type { CollectionEvaluation, WalletPortfolioSummary } from "@/lib/types";

const OPENSEA_BASE_URL = "https://api.opensea.io/api/v2";
const COLLECTION_CACHE_TTL_MS = 1000 * 60 * 5;
const LIVE_TRENDING_LIMIT = 18;
const LIVE_SEARCH_LIMIT = 15;
const collectionEvaluationCache = new Map<
  string,
  { expiresAt: number; value: CollectionEvaluation }
>();

async function openseaFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${OPENSEA_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(env.OPENSEA_API_KEY ? { "x-api-key": env.OPENSEA_API_KEY } : {}),
    },
    next: { revalidate: 120 },
  });

  if (!response.ok) {
    throw new Error(`OpenSea API error ${response.status}: ${response.statusText}`);
  }

  return (await response.json()) as T;
}

type OpenSeaCollection = {
  slug: string;
  collection?: string | null;
  name: string;
  image_url?: string | null;
  banner_image_url?: string | null;
  description?: string | null;
  opensea_url?: string | null;
  telegram_url?: string | null;
  safelist_status?: string | null;
  project_url?: string | null;
  discord_url?: string | null;
  twitter_username?: string | null;
  stats?: {
    floor_price?: number;
    total_volume?: number;
    num_owners?: number;
    total_sales?: number;
    count?: number;
    one_day_change?: number;
    one_day_volume?: number;
    seven_day_volume?: number;
  };
  floor_price?: number;
  total_volume?: number;
  num_owners?: number;
  total_sales?: number;
  count?: number;
  one_day_change?: number;
  one_day_volume?: number;
  seven_day_volume?: number;
};

type OpenSeaCollectionStats = {
  floor_price?: number;
  total_volume?: number;
  num_owners?: number;
  total_sales?: number;
  count?: number;
  one_day_change?: number;
  one_day_volume?: number;
  seven_day_volume?: number;
};

type OpenSeaCollectionResponse = {
  collection: OpenSeaCollection;
};

type OpenSeaStatsResponse = {
  total?: {
    volume?: number;
    sales?: number;
    num_owners?: number;
    floor_price?: number;
  };
  intervals?: {
    interval: string;
    volume?: number;
    sales?: number;
  }[];
};

function getStatsFromOpenSeaCollection(
  collection: OpenSeaCollection
): OpenSeaCollectionStats {
  return {
    floor_price: collection.stats?.floor_price ?? collection.floor_price,
    total_volume: collection.stats?.total_volume ?? collection.total_volume,
    num_owners: collection.stats?.num_owners ?? collection.num_owners,
    total_sales: collection.stats?.total_sales ?? collection.total_sales,
    count: collection.stats?.count ?? collection.count,
    one_day_change: collection.stats?.one_day_change ?? collection.one_day_change,
    one_day_volume: collection.stats?.one_day_volume ?? collection.one_day_volume,
    seven_day_volume:
      collection.stats?.seven_day_volume ?? collection.seven_day_volume,
  };
}

function normalizeCollectionResponse(
  data: OpenSeaCollection | OpenSeaCollectionResponse,
  slug: string
): OpenSeaCollection {
  const collectionCandidate =
    "collection" in data && typeof data.collection === "object"
      ? data.collection
      : (data as OpenSeaCollection);

  const safeCollection = (collectionCandidate ?? {}) as Partial<OpenSeaCollection>;
  const normalizedSlug =
    safeCollection.slug ?? safeCollection.collection ?? slug;

  return {
    slug: normalizedSlug,
    name: safeCollection.name ?? normalizedSlug,
    image_url: safeCollection.image_url ?? null,
    banner_image_url: safeCollection.banner_image_url ?? null,
    description: safeCollection.description ?? null,
    opensea_url:
      safeCollection.opensea_url ?? `https://opensea.io/collection/${normalizedSlug}`,
    telegram_url: safeCollection.telegram_url ?? null,
    safelist_status: safeCollection.safelist_status ?? null,
    project_url: safeCollection.project_url ?? null,
    discord_url: safeCollection.discord_url ?? null,
    twitter_username: safeCollection.twitter_username ?? null,
    stats: safeCollection.stats,
    floor_price: safeCollection.floor_price,
    total_volume: safeCollection.total_volume,
    num_owners: safeCollection.num_owners,
    total_sales: safeCollection.total_sales,
    count: safeCollection.count,
    one_day_change: safeCollection.one_day_change,
    one_day_volume: safeCollection.one_day_volume,
    seven_day_volume: safeCollection.seven_day_volume,
  };
}

function mapStatsApiResponseToSnapshotStats(
  response: OpenSeaStatsResponse
): OpenSeaCollectionStats {
  const intervals = response.intervals ?? [];
  const oneDay = intervals.find((interval) => interval.interval === "one_day");
  const sevenDay = intervals.find((interval) => interval.interval === "seven_day");

  return {
    floor_price: response.total?.floor_price,
    total_volume: response.total?.volume,
    num_owners: response.total?.num_owners,
    total_sales: response.total?.sales,
    one_day_volume: oneDay?.volume,
    seven_day_volume: sevenDay?.volume,
  };
}

function mapOpenSeaCollectionToProfile(collection: OpenSeaCollection) {
  return {
    slug: collection.slug,
    name: collection.name,
    imageUrl: collection.image_url ?? "",
    bannerUrl: collection.banner_image_url ?? null,
    description: collection.description ?? null,
    contractAddress: null,
    chain: "ethereum",
    openseaUrl:
      collection.opensea_url ?? `https://opensea.io/collection/${collection.slug}`,
    officialWebsite: collection.project_url ?? null,
    xUrl: collection.twitter_username
      ? `https://x.com/${collection.twitter_username}`
      : null,
    discordUrl: collection.discord_url ?? null,
    telegramUrl: collection.telegram_url ?? null,
    foundedAt: null,
    founderNames: [],
    verified: collection.safelist_status === "verified",
    claimed: false,
    hasToken: false,
    hasRewardPlatform: false,
    hasIrlEvents: false,
    hasBusinessRevenue: false,
    hasDevFounder: false,
    dataConfidenceLevel: "auto_generated" as const,
  };
}

async function fetchLiveCollectionEvaluationBySlug(
  slug: string
): Promise<CollectionEvaluation> {
  const cached = collectionEvaluationCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [collectionResult, statsResult] = await Promise.allSettled([
    openseaFetch<OpenSeaCollection | OpenSeaCollectionResponse>(`/collections/${slug}`),
    openseaFetch<OpenSeaStatsResponse>(`/collections/${slug}/stats`),
  ]);

  if (collectionResult.status !== "fulfilled") {
    throw collectionResult.reason;
  }

  const collection = normalizeCollectionResponse(collectionResult.value, slug);
  const fallbackStats = getStatsFromOpenSeaCollection(collection);
  const statsFromApi =
    statsResult.status === "fulfilled"
      ? mapStatsApiResponseToSnapshotStats(statsResult.value)
      : {};

  const snapshot = deriveSnapshotFromOpenSea({
    ...fallbackStats,
    ...statsFromApi,
  });

  const evaluation: CollectionEvaluation = {
    profile: mapOpenSeaCollectionToProfile(collection),
    marketSnapshot: {
      ...snapshot,
      collectionSlug: collection.slug,
    },
    score: {
      modelId: "",
      versionId: "",
      overallScore: 0,
      confidenceScore: 0,
      categories: [],
      explainability: [],
      computedAt: "",
    },
  };

  evaluation.score = computeCollectionScore(evaluation, DEFAULT_SCORING_VERSION);
  collectionEvaluationCache.set(slug, {
    expiresAt: Date.now() + COLLECTION_CACHE_TTL_MS,
    value: evaluation,
  });
  return evaluation;
}

async function fetchSeededTopCollections(
  seeds: { slug: string; name: string }[]
): Promise<CollectionEvaluation[]> {
  const resolved = await Promise.allSettled(
    seeds.map(async (seed) => {
      try {
        return await fetchLiveCollectionEvaluationBySlug(seed.slug);
      } catch {
        return null;
      }
    })
  );

  return resolved
    .filter(
      (item): item is PromiseFulfilledResult<CollectionEvaluation | null> =>
        item.status === "fulfilled"
    )
    .map((item) => item.value)
    .filter((item): item is CollectionEvaluation => Boolean(item));
}

function deriveSnapshotFromOpenSea(stats: {
  floor_price?: number;
  one_day_change?: number;
  one_day_volume?: number;
  seven_day_volume?: number;
  total_volume?: number;
  num_owners?: number;
  total_sales?: number;
  count?: number;
}): CollectionEvaluation["marketSnapshot"] {
  const floor = Number(stats.floor_price ?? 0);
  const totalVolume = Number(stats.total_volume ?? 0);
  const oneDayVolume = Number(stats.one_day_volume ?? totalVolume * 0.003);
  const sevenDayVolume = Number(stats.seven_day_volume ?? totalVolume * 0.02);

  return {
    collectionSlug: "unknown",
    floorPriceEth: floor,
    floorChange24hPct: Number(stats.one_day_change ?? 0) * 100,
    volume24hEth: oneDayVolume,
    volume7dEth: sevenDayVolume,
    sales24h: Math.max(0, Number(stats.total_sales ?? 0) * 0.001),
    holderCount: Number(stats.num_owners ?? 0),
    uniqueOwnerPct: Math.min(100, ((stats.num_owners ?? 0) / (stats.count ?? 1)) * 100),
    listedCount: 0,
    listedPct: 0,
    topOfferEth: floor * 0.9,
    bidDepthEth: floor * 10,
    whaleConcentrationPct: null,
    capturedAt: new Date().toISOString(),
  };
}

export async function searchCollections(query: string) {
  if (!query.trim()) {
    const seeded = await fetchSeededTopCollections(
      TOP_OPENSEA_COLLECTION_SEEDS.slice(0, LIVE_SEARCH_LIMIT)
    );
    if (seeded.length) {
      return seeded.map((item) => item.profile);
    }
    return MOCK_COLLECTIONS.map((item) => item.profile);
  }

  const normalizedQuery = query.toLowerCase();

  type SearchResponse = {
    collections: OpenSeaCollection[];
  };

  try {
    const data = await openseaFetch<SearchResponse>(
      `/collections?chain=ethereum&limit=30&name=${encodeURIComponent(query)}`
    );

    if (data.collections?.length) {
      return data.collections.map(mapOpenSeaCollectionToProfile);
    }
  } catch {
    // Fall through to seeded no-key search.
  }

  const matchingSeeds = TOP_OPENSEA_COLLECTION_SEEDS.filter(
    (seed) =>
      seed.slug.toLowerCase().includes(normalizedQuery) ||
      seed.name.toLowerCase().includes(normalizedQuery)
  ).slice(0, LIVE_SEARCH_LIMIT);

  if (matchingSeeds.length) {
    const seeded = await fetchSeededTopCollections(matchingSeeds);
    if (seeded.length) {
      return seeded.map((item) => item.profile);
    }
  }

  return MOCK_COLLECTIONS.filter((item) =>
    item.profile.name.toLowerCase().includes(normalizedQuery)
  ).map((item) => item.profile);
}

function buildFallbackEvaluation(slug: string): CollectionEvaluation {
  const baseline = MOCK_COLLECTIONS[0];
  const fallback: CollectionEvaluation = {
    ...baseline,
    profile: {
      ...baseline.profile,
      slug,
      name: slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      openseaUrl: `https://opensea.io/collection/${slug}`,
    },
    marketSnapshot: {
      ...baseline.marketSnapshot,
      collectionSlug: slug,
    },
  };
  const score = computeCollectionScore(fallback, DEFAULT_SCORING_VERSION);
  return { ...fallback, score };
}

export async function getCollectionEvaluation(slug: string) {
  const mock = MOCK_COLLECTIONS.find((collection) => collection.profile.slug === slug);
  if (mock) {
    const score = computeCollectionScore(mock, DEFAULT_SCORING_VERSION);
    return { ...mock, score };
  }

  try {
    return await fetchLiveCollectionEvaluationBySlug(slug);
  } catch {
    return buildFallbackEvaluation(slug);
  }
}

export async function getTrendingCollections() {
  const seeded = await fetchSeededTopCollections(
    TOP_OPENSEA_COLLECTION_SEEDS.slice(0, LIVE_TRENDING_LIMIT)
  );

  if (seeded.length) {
    return seeded.sort(
      (a, b) =>
        b.marketSnapshot.volume7dEth - a.marketSnapshot.volume7dEth
    );
  }

  return MOCK_COLLECTIONS.map((item) => ({
    ...item,
    score: computeCollectionScore(item, DEFAULT_SCORING_VERSION),
  }));
}

export async function getWalletPortfolio(
  walletAddress: string
): Promise<WalletPortfolioSummary> {
  if (!env.OPENSEA_API_KEY) {
    return { ...MOCK_PORTFOLIO, walletAddress };
  }

  type WalletNftsResponse = {
    nfts: {
      collection?: string;
      identifier: string;
      contract: string;
    }[];
  };

  const data = await openseaFetch<WalletNftsResponse>(
    `/chain/ethereum/account/${walletAddress}/nfts?limit=50`
  );

  const grouped = new Map<string, number>();
  for (const nft of data.nfts) {
    grouped.set(nft.collection ?? nft.contract, (grouped.get(nft.collection ?? nft.contract) ?? 0) + 1);
  }

  const positions = Array.from(grouped.entries()).map(([collection, quantity]) => ({
    collectionSlug: collection,
    collectionName: collection,
    quantity,
    floorValueEth: quantity * 0.5,
    bestOfferValueEth: quantity * 0.45,
  }));

  const optimisticValueEth = positions.reduce((acc, item) => acc + item.floorValueEth, 0);
  const conservativeValueEth = positions.reduce(
    (acc, item) => acc + item.bestOfferValueEth,
    0
  );

  return {
    walletAddress,
    optimisticValueEth,
    conservativeValueEth,
    floorToOfferGapEth: optimisticValueEth - conservativeValueEth,
    topMovers: positions.slice(0, 2).map((item) => item.collectionSlug),
    risingFloors: positions.slice(0, 1).map((item) => item.collectionSlug),
    decliningFloors: positions.slice(1, 2).map((item) => item.collectionSlug),
    strongOffers: positions.slice(0, 1).map((item) => item.collectionSlug),
    potentialSellSignals: [
      "High listing percentage detected",
      "Offer spread tightening near floor",
    ],
    positions,
  };
}

export async function getCollectionEvents(slug: string) {
  if (!env.OPENSEA_API_KEY) {
    return [
      {
        eventType: "sale",
        createdAt: new Date().toISOString(),
        quantity: 1,
        priceEth: 5.1,
      },
    ];
  }
  return openseaFetch(`/events/collection/${slug}?event_type=sale&limit=20`);
}

export async function getCollectionListings(slug: string) {
  if (!env.OPENSEA_API_KEY) {
    return [
      {
        priceEth: 5.9,
        quantity: 1,
      },
    ];
  }
  return openseaFetch(`/listings/collection/${slug}/all?limit=20`);
}

export async function getCollectionTopOffers(slug: string) {
  if (!env.OPENSEA_API_KEY) {
    return [
      {
        priceEth: 5.4,
        quantity: 1,
      },
    ];
  }
  return openseaFetch(`/offers/collection/${slug}/all?limit=20`);
}
