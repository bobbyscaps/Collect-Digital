import { DEFAULT_SCORING_VERSION, MOCK_COLLECTIONS, MOCK_PORTFOLIO } from "@/lib/mock-data";
import { TOP_COLLECTION_SEEDS } from "@/lib/providers/collection-seeds";
import { getVerifiedProfilePatch } from "@/lib/project-governance/store";
import { computeCollectionScore } from "@/lib/scoring/engine";
import { getActiveScoringModelVersion } from "@/lib/scoring/repository";
import { AlchemyProvider } from "@/providers/alchemy/provider";
import { OpenSeaProvider } from "@/providers/opensea/provider";
import { ReservoirProvider } from "@/providers/reservoir/provider";
import { SimpleHashProvider } from "@/providers/simplehash/provider";
import type {
  CollectionEvaluation,
  CollectionProfile,
  ScoringModelVersion,
  WalletCollectionPosition,
  WalletPortfolioSummary,
} from "@/lib/types";
import { env } from "@/lib/env";
import type {
  NormalizedCollection,
} from "@/providers/types";

const LIVE_TRENDING_LIMIT = 18;
const LIVE_SEARCH_LIMIT = 30;
const DEFAULT_CHAIN = "ethereum";
const QUERY_FALLBACKS: Record<
  string,
  { slug: string; name: string; openseaUrl?: string }[]
> = {
  "franky's dinner": [{ slug: "frankys-dinner", name: "Franky's Dinner" }],
  "frankys dinner": [{ slug: "frankys-dinner", name: "Franky's Dinner" }],
  "long lost nft": [{ slug: "the-long-lost", name: "The Long Lost" }],
  "long lost": [{ slug: "the-long-lost", name: "The Long Lost" }],
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SEARCH_ALIAS_SLUGS: Record<string, string[]> = {
  "frankys dinner": ["frankys-dinner"],
  "franky's dinner": ["frankys-dinner"],
  "long lost nft": ["the-long-lost", "long-lost"],
  "long lost": ["the-long-lost", "long-lost"],
};

function generateSlugCandidates(query: string) {
  const normalized = normalizeSearchValue(query);
  const canonical = normalized.replace(/[’']/g, "'");
  const baseSlug = toSlug(query);
  const compactWords = normalized
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const trimmedTokens = compactWords.filter(
    (token) => !["nft", "nfts", "collection", "official", "club"].includes(token)
  );
  const trimmedSlug = trimmedTokens.join("-");

  const candidates = new Set<string>();
  if (baseSlug) {
    candidates.add(baseSlug);
  }
  if (trimmedSlug) {
    candidates.add(trimmedSlug);
    candidates.add(`the-${trimmedSlug}`);
  }
  if (baseSlug.endsWith("-nft")) {
    const noNft = baseSlug.replace(/-nft$/, "");
    if (noNft) {
      candidates.add(noNft);
      candidates.add(`the-${noNft}`);
    }
  }
  if (baseSlug.endsWith("-nfts")) {
    const noNfts = baseSlug.replace(/-nfts$/, "");
    if (noNfts) {
      candidates.add(noNfts);
      candidates.add(`the-${noNfts}`);
    }
  }

  for (const alias of SEARCH_ALIAS_SLUGS[canonical] ?? []) {
    candidates.add(alias);
  }

  return Array.from(candidates).filter(Boolean);
}

function looksLikeContractAddress(value: string) {
  return /^0x[a-f0-9]{40}$/i.test(value.trim());
}

function toHumanNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function collectionDataWeight(collection: NormalizedCollection) {
  let score = 0;
  if (collection.image) score += 2;
  if (collection.metadata.bannerImage) score += 1;
  if (collection.metadata.description) score += 1;
  if (collection.floor > 0) score += 2;
  if (collection.holders > 0) score += 1;
  if (collection.volume > 0) score += 2;
  return score;
}

function mergeCollectionCandidates(
  current: NormalizedCollection,
  incoming: NormalizedCollection
): NormalizedCollection {
  const preferred =
    collectionDataWeight(incoming) > collectionDataWeight(current)
      ? incoming
      : current;
  const secondary = preferred === incoming ? current : incoming;

  return {
    ...preferred,
    floor: Math.max(preferred.floor, secondary.floor),
    topOffer: Math.max(preferred.topOffer, secondary.topOffer),
    holders: Math.max(preferred.holders, secondary.holders),
    sales: Math.max(preferred.sales, secondary.sales),
    liquidity: Math.max(preferred.liquidity, secondary.liquidity),
    listedPercent: Math.max(preferred.listedPercent, secondary.listedPercent),
    volume: Math.max(preferred.volume, secondary.volume),
    metadata: {
      ...secondary.metadata,
      ...preferred.metadata,
      description: preferred.metadata.description || secondary.metadata.description,
      bannerImage: preferred.metadata.bannerImage || secondary.metadata.bannerImage,
      website: preferred.metadata.website || secondary.metadata.website,
      xUrl: preferred.metadata.xUrl || secondary.metadata.xUrl,
      discordUrl: preferred.metadata.discordUrl || secondary.metadata.discordUrl,
      telegramUrl: preferred.metadata.telegramUrl || secondary.metadata.telegramUrl,
      openseaUrl: preferred.metadata.openseaUrl || secondary.metadata.openseaUrl,
      contractAddress:
        preferred.metadata.contractAddress || secondary.metadata.contractAddress,
      chain: preferred.metadata.chain || secondary.metadata.chain,
    },
  };
}

function searchRankScore(
  collection: NormalizedCollection,
  normalizedQuery: string
) {
  const normalizedName = normalizeSearchValue(collection.name);
  const normalizedSlug = normalizeSearchValue(collection.slug);
  let score = 0;

  if (normalizedName === normalizedQuery || normalizedSlug === normalizedQuery) {
    score += 120;
  } else if (
    normalizedName.startsWith(normalizedQuery) ||
    normalizedSlug.startsWith(normalizedQuery)
  ) {
    score += 80;
  } else if (
    normalizedName.includes(normalizedQuery) ||
    normalizedSlug.includes(normalizedQuery)
  ) {
    score += 40;
  }

  score += Math.min(20, Math.log10(1 + Math.max(collection.volume, 0)) * 4);
  score += Math.min(15, collection.holders / 1000);
  score += Math.min(10, collection.floor);
  score += collection.provider === "reservoir" ? 3 : 0;

  return score;
}

function buildSeedFallbackProfile(seed: { slug: string; name: string }): CollectionProfile {
  return {
    slug: seed.slug,
    name: seed.name,
    imageUrl: "",
    baseScore: Math.round(MOCK_COLLECTIONS[0].score.overallScore),
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
    dataConfidenceLevel: "auto_generated",
  };
}

function buildQueryFallbackProfiles(query: string, slugCandidates: string[]) {
  const normalized = normalizeSearchValue(query).replace(/[’]/g, "'");
  const aliases = QUERY_FALLBACKS[normalized] ?? [];
  const aliasProfiles = aliases.map((item) => ({
    slug: item.slug,
    name: item.name,
    imageUrl: "",
    baseScore: 50,
    bannerUrl: null,
    description: null,
    contractAddress: null,
    chain: DEFAULT_CHAIN,
    openseaUrl: item.openseaUrl ?? `https://opensea.io/collection/${item.slug}`,
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

  if (aliasProfiles.length) {
    return aliasProfiles;
  }

  const generatedProfiles = slugCandidates.slice(0, 3).map((slug) => ({
    slug,
    name: toHumanNameFromSlug(slug),
    imageUrl: "",
    baseScore: 50,
    bannerUrl: null,
    description: null,
    contractAddress: null,
    chain: DEFAULT_CHAIN,
    openseaUrl: `https://opensea.io/collection/${slug}`,
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

  const deduped = new Map<string, CollectionProfile>();
  for (const candidate of [...aliasProfiles, ...generatedProfiles]) {
    if (!deduped.has(candidate.slug)) {
      deduped.set(candidate.slug, candidate);
    }
  }
  return Array.from(deduped.values());
}

function toProfile(
  collection: NormalizedCollection,
  baseScore?: number
): CollectionProfile {
  return {
    slug: collection.slug,
    name: collection.name,
    imageUrl: collection.image,
    baseScore,
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
  },
  version: ScoringModelVersion = DEFAULT_SCORING_VERSION
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
  evaluation.score = computeCollectionScore(evaluation, version);
  return evaluation;
}

function toProfileWithBaseScore(
  collection: NormalizedCollection,
  version: ScoringModelVersion = DEFAULT_SCORING_VERSION
) {
  const evaluation = toEvaluation(collection, undefined, version);
  return toProfile(collection, Math.round(evaluation.score.overallScore));
}

function applyGovernancePatch(
  evaluation: CollectionEvaluation,
  version: ScoringModelVersion = DEFAULT_SCORING_VERSION
): CollectionEvaluation {
  const patch = getVerifiedProfilePatch(evaluation.profile.slug);
  if (!Object.keys(patch).length) {
    return evaluation;
  }

  const merged: CollectionEvaluation = {
    ...evaluation,
    profile: {
      ...evaluation.profile,
      ...patch,
      founderNames: patch.founderNames ?? evaluation.profile.founderNames,
    },
  };
  return {
    ...merged,
    score: computeCollectionScore(merged, version),
  };
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
    const version = await getActiveScoringModelVersion();
    const normalizedQuery = normalizeSearchValue(query);
    const slugCandidates = generateSlugCandidates(query);

    if (!normalizedQuery) {
      const seeded = await buildSeededCollections(this.reservoir, 8);
      if (seeded.length) {
        const enrichedSeeded = await Promise.all(
          seeded.map((collection) => this.enrichCollection(collection))
        );
        return enrichedSeeded.map((collection) =>
          toProfileWithBaseScore(collection, version)
        );
      }

      const supplementalSettled = await Promise.allSettled(
        TOP_COLLECTION_SEEDS.slice(0, 8).map((seed) =>
          this.opensea.getCollection(seed.slug)
        )
      );
      const supplementalCollections = supplementalSettled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));

      if (supplementalCollections.length) {
        return supplementalCollections.map((collection) =>
          toProfileWithBaseScore(collection, version)
        );
      }

      return MOCK_COLLECTIONS.slice(0, 8).map((item) => ({
        ...item.profile,
        baseScore: Math.round(item.score.overallScore),
      }));
    }

    const [reservoirResults, openseaSearchResults] = await Promise.all([
      this.reservoir.searchCollections(query, {
        limit: LIVE_SEARCH_LIMIT,
      }),
      this.opensea.searchCollections(query, {
        limit: LIVE_SEARCH_LIMIT,
      }),
    ]);

    const openSeaHydratedSettled = await Promise.allSettled(
      openseaSearchResults
        .slice(0, 12)
        .map((collection) => this.opensea.getCollection(collection.slug))
    );
    const openSeaHydrated = openSeaHydratedSettled
      .filter(
        (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
          item.status === "fulfilled"
      )
      .map((item) => item.value)
      .filter((item): item is NormalizedCollection => Boolean(item));

    const exactCandidates = Array.from(
      new Set([query, normalizedQuery, ...slugCandidates])
    );
    const exactLookups = await Promise.allSettled(
      exactCandidates.flatMap((candidate) => [
        this.reservoir.getCollection(candidate),
        this.opensea.getCollection(candidate),
      ])
    );
    const exactCollections = exactLookups
      .filter(
        (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
          item.status === "fulfilled"
      )
      .map((item) => item.value)
      .filter((item): item is NormalizedCollection => Boolean(item));

    if (looksLikeContractAddress(query)) {
      const contractLookups = await Promise.allSettled([
        this.reservoir.getCollection(query.toLowerCase()),
        this.opensea.getCollection(query.toLowerCase()),
      ]);
      for (const item of contractLookups) {
        if (item.status === "fulfilled" && item.value) {
          exactCollections.push(item.value);
        }
      }
    }

    const candidateMap = new Map<string, NormalizedCollection>();
    const allCandidates = [
      ...reservoirResults,
      ...openSeaHydrated,
      ...openseaSearchResults,
      ...exactCollections,
    ];
    for (const candidate of allCandidates) {
      const key = normalizeSearchValue(candidate.slug || candidate.id);
      const existing = candidateMap.get(key);
      if (!existing) {
        candidateMap.set(key, candidate);
        continue;
      }
      candidateMap.set(key, mergeCollectionCandidates(existing, candidate));
    }

    let mergedCandidates = Array.from(candidateMap.values());

    if (!mergedCandidates.length) {
      const matchingSeeds = TOP_COLLECTION_SEEDS.filter(
        (seed) =>
          normalizeSearchValue(seed.slug).includes(normalizedQuery) ||
          normalizeSearchValue(seed.name).includes(normalizedQuery)
      ).slice(0, LIVE_SEARCH_LIMIT);

      if (!matchingSeeds.length) {
        const mockMatches = MOCK_COLLECTIONS.filter((item) =>
          normalizeSearchValue(item.profile.name).includes(normalizedQuery)
        ).map((item) => ({
          ...item.profile,
          baseScore: Math.round(item.score.overallScore),
        }));
        if (mockMatches.length) {
          return mockMatches;
        }

        return buildQueryFallbackProfiles(query, slugCandidates);
      }

      const seedCollectionsSettled = await Promise.allSettled(
        matchingSeeds.flatMap((seed) => [
          this.reservoir.getCollection(seed.slug),
          this.opensea.getCollection(seed.slug),
        ])
      );
      mergedCandidates = seedCollectionsSettled
        .filter(
          (item): item is PromiseFulfilledResult<NormalizedCollection | null> =>
            item.status === "fulfilled"
        )
        .map((item) => item.value)
        .filter((item): item is NormalizedCollection => Boolean(item));

      if (!mergedCandidates.length) {
        return matchingSeeds.map(buildSeedFallbackProfile);
      }
    }

    const enrichedCandidates = await Promise.all(
      mergedCandidates.map((collection) => this.enrichCollection(collection))
    );

    const ranked = enrichedCandidates
      .map((collection) => ({
        collection,
        rank: searchRankScore(collection, normalizedQuery),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, LIVE_SEARCH_LIMIT)
      .map((item) => item.collection);

    return ranked.map((collection) => toProfileWithBaseScore(collection, version));
  }

  async getTrendingCollections() {
    const version = await getActiveScoringModelVersion();
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
        return supplemental.map((collection) => toEvaluation(collection, undefined, version));
      }
      return MOCK_COLLECTIONS;
    }

    const enriched = await Promise.all(
      seeded.map((collection) => this.enrichCollection(collection))
    );

    return enriched
      .sort((a, b) => b.volume - a.volume)
      .map((collection) => toEvaluation(collection, undefined, version));
  }

  async getCollectionEvaluation(slug: string) {
    const version = await getActiveScoringModelVersion();
    const mock = MOCK_COLLECTIONS.find((collection) => collection.profile.slug === slug);
    if (mock) {
      return applyGovernancePatch(
        {
          ...mock,
          score: computeCollectionScore(mock, version),
        },
        version
      );
    }

    const [collection, sales, historical] = await Promise.all([
      this.reservoir.getCollection(slug),
      this.reservoir.getSales(slug, { limit: 30 }),
      this.reservoir.getHistoricalData(slug, { limit: 7 }),
    ]);

    if (!collection) {
      const openseaSupplemental = await this.opensea.getCollection(slug);
      if (openseaSupplemental) {
        return applyGovernancePatch(
          toEvaluation(openseaSupplemental, undefined, version),
          version
        );
      }
      return applyGovernancePatch(
        {
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
        },
        version
      );
    }

    const enriched = await this.enrichCollection(collection);
    const floorChange24hPct =
      historical.length >= 2 && historical[1].floorPriceEth > 0
        ? ((historical[0].floorPriceEth - historical[1].floorPriceEth) /
            historical[1].floorPriceEth) *
          100
        : 0;

    return applyGovernancePatch(
      toEvaluation(
        enriched,
        {
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
        },
        version
      ),
      version
    );
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
