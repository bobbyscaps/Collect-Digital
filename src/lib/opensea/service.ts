import { env } from "@/lib/env";
import {
  DEFAULT_SCORING_VERSION,
  MOCK_COLLECTIONS,
  MOCK_PORTFOLIO,
} from "@/lib/mock-data";
import { computeCollectionScore } from "@/lib/scoring/engine";
import type { CollectionEvaluation, WalletPortfolioSummary } from "@/lib/types";

const OPENSEA_BASE_URL = "https://api.opensea.io/api/v2";

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

function deriveSnapshotFromOpenSea(stats: {
  floor_price?: number;
  total_volume?: number;
  num_owners?: number;
  total_sales?: number;
  count?: number;
}): CollectionEvaluation["marketSnapshot"] {
  return {
    collectionSlug: "unknown",
    floorPriceEth: Number(stats.floor_price ?? 0),
    floorChange24hPct: 0,
    volume24hEth: 0,
    volume7dEth: Number(stats.total_volume ?? 0) * 0.02,
    sales24h: Number(stats.total_sales ?? 0) * 0.001,
    holderCount: Number(stats.num_owners ?? 0),
    uniqueOwnerPct: Math.min(100, ((stats.num_owners ?? 0) / (stats.count ?? 1)) * 100),
    listedCount: 0,
    listedPct: 0,
    topOfferEth: Number(stats.floor_price ?? 0) * 0.9,
    bidDepthEth: Number(stats.floor_price ?? 0) * 10,
    whaleConcentrationPct: null,
    capturedAt: new Date().toISOString(),
  };
}

export async function searchCollections(query: string) {
  if (!query.trim()) {
    return MOCK_COLLECTIONS.map((item) => item.profile);
  }

  if (!env.OPENSEA_API_KEY) {
    return MOCK_COLLECTIONS.filter((item) =>
      item.profile.name.toLowerCase().includes(query.toLowerCase())
    ).map((item) => item.profile);
  }

  type SearchResponse = {
    collections: {
      collection: string;
      name: string;
      image_url?: string;
      slug: string;
      description?: string;
    }[];
  };

  const data = await openseaFetch<SearchResponse>(
    `/collections?chain=ethereum&limit=20&name=${encodeURIComponent(query)}`
  );

  return data.collections.map((collection) => ({
    slug: collection.slug,
    name: collection.name,
    imageUrl: collection.image_url ?? "",
    bannerUrl: null,
    description: collection.description ?? null,
    contractAddress: null,
    chain: "ethereum",
    openseaUrl: `https://opensea.io/collection/${collection.slug}`,
    officialWebsite: null,
    xUrl: null,
    discordUrl: null,
    telegramUrl: null,
    foundedAt: null,
    founderNames: [],
    verified: false,
    claimed: false,
    hasToken: false,
    hasRewardPlatform: false,
    hasIrlEvents: false,
    hasBusinessRevenue: false,
    hasDevFounder: false,
    dataConfidenceLevel: "auto_generated" as const,
  }));
}

export async function getCollectionEvaluation(slug: string) {
  const mock = MOCK_COLLECTIONS.find((collection) => collection.profile.slug === slug);
  if (!env.OPENSEA_API_KEY || mock) {
    const baseline = mock ?? MOCK_COLLECTIONS[0];
    const score = computeCollectionScore(baseline, DEFAULT_SCORING_VERSION);
    return { ...baseline, score };
  }

  type CollectionResponse = {
    collection: {
      name: string;
      description?: string;
      image_url?: string;
      banner_image_url?: string;
      project_url?: string;
      twitter_username?: string;
      discord_url?: string;
      stats?: {
        floor_price?: number;
        total_volume?: number;
        num_owners?: number;
        total_sales?: number;
        count?: number;
      };
    };
  };

  const data = await openseaFetch<CollectionResponse>(`/collections/${slug}`);
  const snapshot = deriveSnapshotFromOpenSea(data.collection.stats ?? {});

  const evaluation: CollectionEvaluation = {
    profile: {
      slug,
      name: data.collection.name,
      imageUrl: data.collection.image_url ?? "",
      bannerUrl: data.collection.banner_image_url ?? null,
      description: data.collection.description ?? null,
      chain: "ethereum",
      contractAddress: null,
      openseaUrl: `https://opensea.io/collection/${slug}`,
      officialWebsite: data.collection.project_url ?? null,
      xUrl: data.collection.twitter_username
        ? `https://x.com/${data.collection.twitter_username}`
        : null,
      discordUrl: data.collection.discord_url ?? null,
      telegramUrl: null,
      foundedAt: null,
      founderNames: [],
      verified: false,
      claimed: false,
      hasToken: false,
      hasRewardPlatform: false,
      hasIrlEvents: false,
      hasBusinessRevenue: false,
      hasDevFounder: false,
      dataConfidenceLevel: "auto_generated",
    },
    marketSnapshot: {
      ...snapshot,
      collectionSlug: slug,
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

  return evaluation;
}

export async function getTrendingCollections() {
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
