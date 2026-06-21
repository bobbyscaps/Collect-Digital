import { DEFAULT_SCORING_VERSION, MOCK_COLLECTIONS, MOCK_PORTFOLIO } from "@/lib/mock-data";
import { TOP_COLLECTION_SEEDS } from "@/lib/providers/collection-seeds";
import { computeCollectionScore } from "@/lib/scoring/engine";
import { AlchemyProvider } from "@/providers/alchemy/provider";
import { OpenSeaProvider } from "@/providers/opensea/provider";
import { ReservoirProvider } from "@/providers/reservoir/provider";
import { SimpleHashProvider } from "@/providers/simplehash/provider";
import type {
  CollectionEvaluation,
  CollectionProfile,
  WalletCollectionPosition,
  WalletPortfolioSummary,
} from "@/lib/types";
import { env } from "@/lib/env";
import type {
  NormalizedCollection,
} from "@/providers/types";

const LIVE_TRENDING_LIMIT = 18;
const LIVE_SEARCH_LIMIT = 15;
const DEFAULT_CHAIN = "ethereum";

function toProfile(collection: NormalizedCollection): CollectionProfile {
  return {
    slug: collection.slug,
    name: collection.name,
    imageUrl: collection.image,
    bannerUrl: collection.metadata.bannerImage ?? null,
    description: collection.metadata.description ?? null,
    contractAddress: collection.metadata.contractAddress ?? null,
    chain: collection.metadata.chain ?? DEFAULT_CHAIN,
    openseaUrl:
      collection.metadata.openseaUrl ?? `https://opensea.io/collection/${collection.slug}`,
    officialWebsite: collection.metadata.website ?? null,
    xUrl: collection.metadata.xUrl ?? null,
    discordUrl: collection.metadata.discordUrl ?? null,
    telegramUrl: collection.metadata.telegramUrl ?? null,
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
  };
}

function toEvaluation(
  collection: NormalizedCollection,
  extras?: {
    sales24h?: number;
    floorChange24hPct?: number;
    bidDepthEth?: number;
    listedCount?: number;
  }
): CollectionEvaluation {
  const profile = toProfile(collection);
  const evaluation: CollectionEvaluation = {
    profile,
    marketSnapshot: {
      collectionSlug: collection.slug,
      floorPriceEth: collection.floor,
      floorChange24hPct: extras?.floorChange24hPct ?? 0,
      volume24hEth: collection.volume * 0.25,
      volume7dEth: collection.volume,
      sales24h: extras?.sales24h ?? Math.max(0, collection.sales * 0.05),
      holderCount: collection.holders,
      uniqueOwnerPct: Math.min(100, collection.holders > 0 ? 55 : 0),
      listedCount: extras?.listedCount ?? Math.max(0, Math.round(collection.holders * (collection.listedPercent / 100))),
      listedPct: collection.listedPercent,
      topOfferEth: collection.topOffer,
      bidDepthEth: extras?.bidDepthEth ?? Math.max(0, collection.liquidity),
      whaleConcentrationPct: null,
      capturedAt: new Date().toISOString(),
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

async function buildSeededCollections(
  reservoir: ReservoirProvider,
  limit: number
) {
  const selectedSeeds = TOP_COLLECTION_SEEDS.slice(0, limit);
  const settled = await Promise.allSettled(
    selectedSeeds.map((seed) => reservoir.getCollection(seed.slug))
  );
  return settled
    .filter(
      (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
        item.status === "fulfilled"
    )
    .map((item) => item.value)
    .filter((item): item is NormalizedCollection => Boolean(item));
}

class NftDataService {
  private reservoir = new ReservoirProvider(env.RESERVOIR_API_KEY);
  private alchemy = new AlchemyProvider(env.ALCHEMY_API_KEY);
  private opensea = new OpenSeaProvider(env.OPENSEA_API_KEY);
  private simplehash = new SimpleHashProvider(env.SIMPLEHASH_API_KEY);

  private async enrichCollection(
    collection: NormalizedCollection
  ): Promise<NormalizedCollection> {
    if (collection.image && collection.metadata.description) {
      return collection;
    }

    const [simplehashCollection, openseaCollection] = await Promise.all([
      this.simplehash.getCollection(collection.slug),
      this.opensea.getCollection(collection.slug),
    ]);

    const metadataSource = simplehashCollection ?? openseaCollection;
    if (!metadataSource) {
      return collection;
    }

    return {
      ...collection,
      image: collection.image || metadataSource.image,
      metadata: {
        ...metadataSource.metadata,
        ...collection.metadata,
        openseaUrl:
          collection.metadata.openseaUrl ??
          metadataSource.metadata.openseaUrl ??
          `https://opensea.io/collection/${collection.slug}`,
      },
    };
  }

  async searchCollections(query: string) {
    const normalizedQuery = query.toLowerCase();
    const reservoirResults = await this.reservoir.searchCollections(query, {
      limit: LIVE_SEARCH_LIMIT,
    });

    if (reservoirResults.length) {
      const enriched = await Promise.all(
        reservoirResults.map((collection) => this.enrichCollection(collection))
      );
      return enriched.map(toProfile);
    }

    const matchingSeeds = TOP_COLLECTION_SEEDS.filter(
      (seed) =>
        seed.slug.toLowerCase().includes(normalizedQuery) ||
        seed.name.toLowerCase().includes(normalizedQuery)
    ).slice(0, LIVE_SEARCH_LIMIT);

    if (matchingSeeds.length) {
      const settled = await Promise.allSettled(
        matchingSeeds.map((seed) => this.reservoir.getCollection(seed.slug))
      );
      const results = settled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));
      if (results.length) {
        return results.map(toProfile);
      }

      const supplementalSettled = await Promise.allSettled(
        matchingSeeds.map((seed) => this.opensea.getCollection(seed.slug))
      );
      const supplementalResults = supplementalSettled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));
      if (supplementalResults.length) {
        return supplementalResults.map(toProfile);
      }

      return matchingSeeds.map((seed) => ({
        slug: seed.slug,
        name: seed.name,
        imageUrl: "",
        bannerUrl: null,
        description: null,
        contractAddress: null,
        chain: DEFAULT_CHAIN,
        openseaUrl: `https://opensea.io/collection/${seed.slug}`,
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

    return MOCK_COLLECTIONS.filter((item) =>
      item.profile.name.toLowerCase().includes(normalizedQuery)
    ).map((item) => item.profile);
  }

  async getTrendingCollections() {
    const seeded = await buildSeededCollections(this.reservoir, LIVE_TRENDING_LIMIT);
    if (!seeded.length) {
      const supplementalSettled = await Promise.allSettled(
        TOP_COLLECTION_SEEDS.slice(0, LIVE_TRENDING_LIMIT).map((seed) =>
          this.opensea.getCollection(seed.slug)
        )
      );
      const supplemental = supplementalSettled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));
      if (supplemental.length) {
        return supplemental.map((collection) => toEvaluation(collection));
      }
      return MOCK_COLLECTIONS;
    }

    const enriched = await Promise.all(
      seeded.map((collection) => this.enrichCollection(collection))
    );

    return enriched
      .sort((a, b) => b.volume - a.volume)
      .map((collection) => toEvaluation(collection));
  }

  async getCollectionEvaluation(slug: string) {
    const mock = MOCK_COLLECTIONS.find((collection) => collection.profile.slug === slug);
    if (mock) {
      return {
        ...mock,
        score: computeCollectionScore(mock, DEFAULT_SCORING_VERSION),
      };
    }

    const [collection, sales, historical] = await Promise.all([
      this.reservoir.getCollection(slug),
      this.reservoir.getSales(slug, { limit: 30 }),
      this.reservoir.getHistoricalData(slug, { limit: 7 }),
    ]);

    if (!collection) {
      const openseaSupplemental = await this.opensea.getCollection(slug);
      if (openseaSupplemental) {
        return toEvaluation(openseaSupplemental);
      }
      return {
        ...MOCK_COLLECTIONS[0],
        profile: {
          ...MOCK_COLLECTIONS[0].profile,
          slug,
          name: slug
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" "),
          openseaUrl: `https://opensea.io/collection/${slug}`,
        },
      };
    }

    const enriched = await this.enrichCollection(collection);
    const floorChange24hPct =
      historical.length >= 2 && historical[1].floorPriceEth > 0
        ? ((historical[0].floorPriceEth - historical[1].floorPriceEth) /
            historical[1].floorPriceEth) *
          100
        : 0;

    return toEvaluation(enriched, {
      sales24h: sales.length,
      floorChange24hPct,
      bidDepthEth: Math.max(
        0,
        (await this.reservoir.getOffers(slug, { limit: 20 })).reduce(
          (acc, offer) => acc + offer.priceEth,
          0
        )
      ),
      listedCount: (
        await this.reservoir.getListings(slug, { limit: 50 })
      ).length,
    });
  }

  async getCollectionListings(slug: string) {
    return this.reservoir.getListings(slug, { limit: 50 });
  }

  async getCollectionOffers(slug: string) {
    return this.reservoir.getOffers(slug, { limit: 50 });
  }

  async getCollectionSales(slug: string) {
    return this.reservoir.getSales(slug, { limit: 50 });
  }

  private buildWalletSignals(positions: WalletCollectionPosition[]) {
    const topByFloor = [...positions]
      .sort((a, b) => b.floorValueEth - a.floorValueEth)
      .slice(0, 3)
      .map((item) => item.collectionSlug);
    const weakByOfferGap = [...positions]
      .sort(
        (a, b) =>
          b.floorValueEth -
          b.bestOfferValueEth -
          (a.floorValueEth - a.bestOfferValueEth)
      )
      .slice(0, 3)
      .map((item) => item.collectionSlug);

    return {
      topMovers: topByFloor,
      risingFloors: topByFloor.slice(0, 2),
      decliningFloors: weakByOfferGap.slice(0, 2),
      strongOffers: [...positions]
        .sort(
          (a, b) =>
            b.bestOfferValueEth / Math.max(b.floorValueEth, 1e-9) -
            a.bestOfferValueEth / Math.max(a.floorValueEth, 1e-9)
        )
        .slice(0, 2)
        .map((item) => item.collectionSlug),
      potentialSellSignals: weakByOfferGap.map(
        (slug) => `${slug}: listed supply pressure and weaker bid support`
      ),
    };
  }

  async getWalletPortfolio(walletAddress: string): Promise<WalletPortfolioSummary> {
    const nfts = await this.alchemy.getWalletNFTs(walletAddress, { limit: 200 });
    if (!nfts.length) {
      return { ...MOCK_PORTFOLIO, walletAddress };
    }

    const grouped = new Map<
      string,
      {
        collectionSlug: string;
        collectionName: string;
        quantity: number;
      }
    >();

    for (const nft of nfts) {
      const existing = grouped.get(nft.collectionSlug);
      if (!existing) {
        grouped.set(nft.collectionSlug, {
          collectionSlug: nft.collectionSlug,
          collectionName: nft.collectionName,
          quantity: nft.quantity,
        });
      } else {
        existing.quantity += nft.quantity;
      }
    }

    const positions = await Promise.all(
      Array.from(grouped.values()).map(async (position) => {
        const stats = await this.reservoir.getCollection(position.collectionSlug);
        const floor = stats?.floor ?? 0;
        const offer = stats?.topOffer ?? floor * 0.9;

        return {
          collectionSlug: position.collectionSlug,
          collectionName: position.collectionName,
          quantity: position.quantity,
          floorValueEth: floor * position.quantity,
          bestOfferValueEth: offer * position.quantity,
        } satisfies WalletCollectionPosition;
      })
    );

    const optimisticValueEth = positions.reduce((acc, item) => acc + item.floorValueEth, 0);
    const conservativeValueEth = positions.reduce(
      (acc, item) => acc + item.bestOfferValueEth,
      0
    );
    const signals = this.buildWalletSignals(positions);

    return {
      walletAddress,
      optimisticValueEth,
      conservativeValueEth,
      floorToOfferGapEth: optimisticValueEth - conservativeValueEth,
      positions,
      ...signals,
    };
  }
}

export const nftDataService = new NftDataService();
