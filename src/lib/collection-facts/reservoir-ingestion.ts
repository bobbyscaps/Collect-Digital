import type {
  CollectionFactSyncRun,
  CollectionIdentity,
  CollectionIdentityAlias,
  CollectionMarketSnapshotFact,
  CollectionSaleEventFact,
  CollectionTraitSnapshotFact,
} from "@/lib/collection-facts/domain";
import type {
  CollectionFactsRepository,
  UpsertCollectionMarketSnapshotInput,
  UpsertCollectionSaleEventInput,
  UpsertCollectionTraitSnapshotInput,
} from "@/lib/collection-facts/repository";
import type {
  NormalizedCollection,
  NormalizedListing,
  NormalizedOffer,
  NormalizedSale,
} from "@/providers/types";
import type { ReservoirOffersPageResult } from "@/providers/reservoir/provider";
import { ReservoirProvider } from "@/providers/reservoir/provider";

const DEFAULT_OFFER_PAGE_LIMIT = 200;
const DEFAULT_LISTINGS_LIMIT = 200;
const DEFAULT_SALES_LIMIT = 400;
const DEFAULT_NEAR_FLOOR_BAND_PCT = 20;
const MAX_OFFER_PAGINATION_PAGES = 60;

type IngestionComponentName = "collection" | "market" | "sales" | "traits";

export type IngestionComponentStatus = "success" | "partial" | "failure" | "skipped";

export interface IngestionComponentResult {
  status: IngestionComponentStatus;
  details: string;
}

export interface ReservoirCollectionFactIngestionRequest {
  collectionRef: string;
  chainNamespace?: string;
  observedAt?: string;
  offersLimit?: number;
  listingsLimit?: number;
  salesLimit?: number;
  nearFloorBandPct?: number;
  soldAfter?: string;
  soldBefore?: string;
  includeTraits?: boolean;
}

export interface ReservoirCollectionFactIngestionResult {
  syncRun: CollectionFactSyncRun;
  collectionIdentity: CollectionIdentity | null;
  aliases: readonly CollectionIdentityAlias[];
  marketSnapshot: CollectionMarketSnapshotFact | null;
  saleEvents: readonly CollectionSaleEventFact[];
  droppedSalesCount: number;
  traitSnapshot: CollectionTraitSnapshotFact | null;
  componentResults: Readonly<Record<IngestionComponentName, IngestionComponentResult>>;
  errors: readonly string[];
}

export interface ReservoirCollectionFactsIngestionService {
  ingestCollectionFacts(
    request: ReservoirCollectionFactIngestionRequest
  ): Promise<ReservoirCollectionFactIngestionResult>;
}

interface ReservoirCollectionFactsDataSource {
  getCollection(collectionId: string): Promise<NormalizedCollection | null>;
  getOffers(
    collectionId: string,
    options?: { limit?: number }
  ): Promise<NormalizedOffer[]>;
  getOffersPage?: (
    collectionId: string,
    options?: { limit?: number; continuation?: string | null }
  ) => Promise<ReservoirOffersPageResult>;
  getListings(
    collectionId: string,
    options?: { limit?: number }
  ): Promise<NormalizedListing[]>;
  getSales(collectionId: string, options?: { limit?: number }): Promise<NormalizedSale[]>;
}

export interface CreateReservoirCollectionFactsIngestionServiceOptions {
  facts: CollectionFactsRepository;
  reservoir: ReservoirCollectionFactsDataSource;
  now?: () => Date;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function normalizeCollectionRef(collectionRef: string): string {
  const normalized = collectionRef.trim();
  if (!normalized) {
    throw new Error("collectionRef is required.");
  }
  return normalized;
}

function normalizeChainNamespace(
  input: string | undefined,
  collection: NormalizedCollection
): string {
  if (input?.trim()) {
    return input.trim().toLowerCase();
  }

  const chain = collection.metadata.chain?.trim().toLowerCase();
  if (chain === "ethereum") return "eip155";
  if (chain === "solana") return "solana";
  return chain ?? "eip155";
}

function normalizeContractAddress(chainNamespace: string, address: string): string {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Collection contract address is missing.");
  }
  if (chainNamespace === "eip155") return trimmed.toLowerCase();
  return trimmed;
}

function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return trimmed;
}

function parseNumericDateOrNull(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(
  soldAt: string | undefined,
  range: { minSoldAtMs: number | null; maxSoldAtMs: number | null }
): boolean {
  if (!soldAt) return false;
  const soldAtMs = Date.parse(soldAt);
  if (!Number.isFinite(soldAtMs)) return false;
  if (range.minSoldAtMs != null && soldAtMs < range.minSoldAtMs) return false;
  if (range.maxSoldAtMs != null && soldAtMs > range.maxSoldAtMs) return false;
  return true;
}

interface NearFloorOfferDepthResult {
  nearFloorOfferValueNative: number | null;
  activeOfferCount: number | null;
  completenessStatus: "complete" | "partial";
  endpoint: string;
  details: string;
}

async function fetchNearFloorOfferDepth(input: {
  reservoir: ReservoirCollectionFactsDataSource;
  collectionSlug: string;
  floorPriceNative: number | null;
  nearFloorBandPct: number;
  offersPageLimit: number;
}): Promise<NearFloorOfferDepthResult> {
  const floor = input.floorPriceNative;
  if (floor == null || floor <= 0) {
    return {
      nearFloorOfferValueNative: null,
      activeOfferCount: null,
      completenessStatus: "partial",
      endpoint: "/orders/bids/v6",
      details: "Floor price unavailable; near-floor offer depth cannot be computed.",
    };
  }

  const minPrice = floor * (1 - input.nearFloorBandPct / 100);

  if (!input.reservoir.getOffersPage) {
    return {
      nearFloorOfferValueNative: null,
      activeOfferCount: null,
      completenessStatus: "partial",
      endpoint: "/orders/bids/v6",
      details:
        "Offer continuation pagination is unavailable for this provider adapter; near-floor liquidity cannot be confirmed complete.",
    };
  }

  const offersPageLimit = Math.max(1, Math.min(200, input.offersPageLimit));
  let continuation: string | null = null;
  let pageCount = 0;
  let nearFloorOfferValueNative = 0;
  let activeOfferCount = 0;
  let previousPageMinPrice: number | null = null;
  let orderingGuaranteedAcrossPages = true;
  let hitBelowThresholdWithOrdering = false;

  while (true) {
    if (pageCount >= MAX_OFFER_PAGINATION_PAGES) {
      return {
        nearFloorOfferValueNative: null,
        activeOfferCount: null,
        completenessStatus: "partial",
        endpoint: "/orders/bids/v6",
        details:
          "Offer pagination exceeded safety page cap before confirming complete qualifying depth.",
      };
    }

    const page = await input.reservoir.getOffersPage(input.collectionSlug, {
      limit: offersPageLimit,
      continuation,
    });
    pageCount += 1;
    const pageOffers = page.offers;
    activeOfferCount += pageOffers.length;

    const pageQualifyingValue = pageOffers
      .filter((offer) => offer.priceEth >= minPrice && offer.priceEth <= floor)
      .reduce((total, offer) => total + offer.priceEth, 0);
    nearFloorOfferValueNative += pageQualifyingValue;

    const pageBelowThreshold = pageOffers.some((offer) => offer.priceEth < minPrice);
    const pageMaxPrice =
      pageOffers.length > 0
        ? pageOffers.reduce((max, offer) => Math.max(max, offer.priceEth), pageOffers[0].priceEth)
        : null;
    const pageMinPrice =
      pageOffers.length > 0
        ? pageOffers.reduce((min, offer) => Math.min(min, offer.priceEth), pageOffers[0].priceEth)
        : null;

    if (!page.sortedByPriceDesc) {
      orderingGuaranteedAcrossPages = false;
    }
    if (
      previousPageMinPrice != null &&
      pageMaxPrice != null &&
      pageMaxPrice > previousPageMinPrice
    ) {
      orderingGuaranteedAcrossPages = false;
    }
    if (pageMinPrice != null) {
      previousPageMinPrice = pageMinPrice;
    }

    continuation = page.continuation;

    if (!continuation) {
      return {
        nearFloorOfferValueNative,
        activeOfferCount,
        completenessStatus: "complete",
        endpoint: "/orders/bids/v6",
        details: `Offer depth scanned through final page (${pageCount} page(s)).`,
      };
    }

    if (orderingGuaranteedAcrossPages && pageBelowThreshold) {
      hitBelowThresholdWithOrdering = true;
    }

    if (hitBelowThresholdWithOrdering) {
      return {
        nearFloorOfferValueNative,
        activeOfferCount: null,
        completenessStatus: "complete",
        endpoint: "/orders/bids/v6",
        details:
          "Offer pagination stopped early after crossing threshold with stable descending price ordering.",
      };
    }
  }
}

function resolveSalesCompleteness(input: {
  droppedSalesCount: number;
  hadSalesEndpointFailure: boolean;
}): "complete" | "partial" {
  if (input.hadSalesEndpointFailure || input.droppedSalesCount > 0) {
    return "partial";
  }
  return "complete";
}

function buildTraitsSnapshotInput(input: {
  collectionIdentityId: string;
  observedAt: string;
  ingestedAt: string;
  includeTraits: boolean;
  collection: NormalizedCollection;
}): UpsertCollectionTraitSnapshotInput | null {
  if (!input.includeTraits) {
    return null;
  }

  const traitCategoryCount = input.collection.traitCategoryCount ?? null;
  const distinctTraitValueCount = input.collection.distinctTraitValueCount ?? null;
  const reportedSupply = input.collection.supply ?? null;
  const oneOfOneAssetCount = input.collection.oneOfOneAssetCount ?? null;
  const oneOfOneSupplyPct =
    oneOfOneAssetCount != null && reportedSupply != null && reportedSupply > 0
      ? (oneOfOneAssetCount / reportedSupply) * 100
      : null;
  const hasTraitDetail =
    traitCategoryCount != null ||
    distinctTraitValueCount != null ||
    oneOfOneAssetCount != null;

  return {
    collectionIdentityId: input.collectionIdentityId,
    sourceProvider: "reservoir",
    sourceEndpoint: "/collections/v7",
    observedAt: input.observedAt,
    ingestedAt: input.ingestedAt,
    completenessStatus: hasTraitDetail ? "complete" : "partial",
    traitCategoryCount,
    distinctTraitValueCount,
    reportedSupply,
    oneOfOneAssetCount,
    oneOfOneSupplyPct,
  };
}

function baseComponentResults(): Record<IngestionComponentName, IngestionComponentResult> {
  return {
    collection: {
      status: "failure",
      details: "Collection was not resolved.",
    },
    market: {
      status: "skipped",
      details: "Market ingestion skipped.",
    },
    sales: {
      status: "skipped",
      details: "Sales ingestion skipped.",
    },
    traits: {
      status: "skipped",
      details: "Trait ingestion skipped.",
    },
  };
}

export function createReservoirCollectionFactsIngestionService(
  options: CreateReservoirCollectionFactsIngestionServiceOptions
): ReservoirCollectionFactsIngestionService {
  const now = options.now ?? (() => new Date());

  return {
    async ingestCollectionFacts(
      request: ReservoirCollectionFactIngestionRequest
    ): Promise<ReservoirCollectionFactIngestionResult> {
      const collectionRef = normalizeCollectionRef(request.collectionRef);
      const syncRun = await options.facts.startCollectionFactSyncRun({
        sourceProvider: "reservoir",
        sourceEndpoint: "/collections/v7",
        syncScope: `collection:${collectionRef}`,
        syncStartedAt: nowIso(now),
      });

      const componentResults = baseComponentResults();
      const errors: string[] = [];
      let collectionIdentity: CollectionIdentity | null = null;
      let aliases: readonly CollectionIdentityAlias[] = [];
      let marketSnapshot: CollectionMarketSnapshotFact | null = null;
      let saleEvents: readonly CollectionSaleEventFact[] = Object.freeze([]);
      let droppedSalesCount = 0;
      let traitSnapshot: CollectionTraitSnapshotFact | null = null;
      let completedSyncRun = syncRun;

      try {
        const collection = await options.reservoir.getCollection(collectionRef);
        if (!collection) {
          errors.push(`Collection not found in Reservoir for "${collectionRef}".`);
          componentResults.collection = {
            status: "failure",
            details: "Reservoir collection lookup returned no result.",
          };
        } else {
          const chainNamespace = normalizeChainNamespace(
            request.chainNamespace,
            collection
          );
          const contractAddress = normalizeContractAddress(
            chainNamespace,
            collection.metadata.contractAddress ?? ""
          );

          const identityResult = await options.facts.upsertCollectionIdentity({
            chainNamespace,
            contractAddress,
            aliases: [
              {
                provider: "reservoir",
                aliasKind: "slug",
                aliasValue: collection.slug,
              },
              {
                provider: "reservoir",
                aliasKind: "provider_id",
                aliasValue: collection.id,
              },
              {
                provider: "reservoir",
                aliasKind: "contract_alias",
                aliasValue: contractAddress,
              },
            ],
          });
          collectionIdentity = identityResult.identity;
          aliases = identityResult.aliases;
          componentResults.collection = {
            status: "success",
            details: "Collection identity resolved and aliases upserted.",
          };

          const observedAt = request.observedAt ?? nowIso(now);
          const ingestedAt = nowIso(now);
          const listingsLimit = request.listingsLimit ?? DEFAULT_LISTINGS_LIMIT;
          const offersPageLimit = request.offersLimit ?? DEFAULT_OFFER_PAGE_LIMIT;
          const salesLimit = request.salesLimit ?? DEFAULT_SALES_LIMIT;
          const nearFloorBandPct =
            request.nearFloorBandPct ?? DEFAULT_NEAR_FLOOR_BAND_PCT;

          const [offerDepthResult, listingsResult, salesResult] = await Promise.allSettled([
            fetchNearFloorOfferDepth({
              reservoir: options.reservoir,
              collectionSlug: collection.slug,
              floorPriceNative: Number.isFinite(collection.floor)
                ? collection.floor
                : null,
              nearFloorBandPct,
              offersPageLimit,
            }),
            options.reservoir.getListings(collection.slug, { limit: listingsLimit }),
            options.reservoir.getSales(collection.slug, { limit: salesLimit }),
          ]);

          // Market facts
          try {
            const listings =
              listingsResult.status === "fulfilled"
                ? listingsResult.value
                : ([] as NormalizedListing[]);
            const offerDepth =
              offerDepthResult.status === "fulfilled" ? offerDepthResult.value : null;
            const supply = collection.supply ?? null;
            const listedCount =
              collection.listedCount ??
              (listingsResult.status === "fulfilled" ? listings.length : null);
            const listedPct =
              Number.isFinite(collection.listedPercent) &&
              collection.listedPercent >= 0 &&
              collection.listedPercent <= 100
                ? collection.listedPercent
                : null;

            const marketCompleteness: "complete" | "partial" =
              offerDepth?.completenessStatus === "complete" &&
              (listingsResult.status === "fulfilled" || listedCount != null)
                ? "complete"
                : "partial";

            const marketInputs: UpsertCollectionMarketSnapshotInput[] = [
              {
                collectionIdentityId: collectionIdentity.id,
                sourceProvider: "reservoir",
                sourceEndpoint: "/collections/v7,/orders/bids/v6,/orders/asks/v5",
                observedAt,
                ingestedAt,
                completenessStatus: marketCompleteness,
                floorPriceNative: Number.isFinite(collection.floor)
                  ? collection.floor
                  : null,
                topOfferNative: Number.isFinite(collection.topOffer)
                  ? collection.topOffer
                  : null,
                nearFloorOfferValueNative: offerDepth?.nearFloorOfferValueNative ?? null,
                activeOfferCount: offerDepth?.activeOfferCount ?? null,
                activeListingCount: listedCount,
                listedPct,
                totalSupply: supply,
                holderCount: Number.isFinite(collection.holders)
                  ? collection.holders
                  : null,
              },
            ];

            const written = await options.facts.upsertCollectionMarketSnapshots(
              marketInputs
            );
            marketSnapshot = written[0] ?? null;

            if (offerDepthResult.status === "rejected") {
              errors.push(
                `Near-floor offer depth failed: ${
                  offerDepthResult.reason instanceof Error
                    ? offerDepthResult.reason.message
                    : String(offerDepthResult.reason)
                }`
              );
            }
            if (listingsResult.status === "rejected" && listedCount == null) {
              errors.push(
                `Listings endpoint failed: ${
                  listingsResult.reason instanceof Error
                    ? listingsResult.reason.message
                    : String(listingsResult.reason)
                }`
              );
            }
            componentResults.market = {
              status:
                marketCompleteness === "complete" &&
                offerDepthResult.status === "fulfilled" &&
                (listingsResult.status === "fulfilled" || listedCount != null)
                  ? "success"
                  : "partial",
              details:
                marketCompleteness === "complete"
                  ? "Market snapshot persisted from Reservoir collection/offer/listing facts."
                  : `Market snapshot persisted with partial coverage. ${
                      offerDepth?.details ?? "Offer depth unavailable."
                    }`,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown market ingestion error.";
            errors.push(`Market ingestion failed: ${message}`);
            componentResults.market = {
              status: "failure",
              details: message,
            };
          }

          // Sales facts
          try {
            if (salesResult.status === "rejected") {
              const message =
                salesResult.reason instanceof Error
                  ? salesResult.reason.message
                  : String(salesResult.reason);
              errors.push(`Sales endpoint failed: ${message}`);
              componentResults.sales = {
                status: "failure",
                details: message,
              };
            } else {
              const minSoldAtMs = parseNumericDateOrNull(request.soldAfter);
              const maxSoldAtMs = parseNumericDateOrNull(request.soldBefore);
              const range = { minSoldAtMs, maxSoldAtMs };
              const normalizedSales: UpsertCollectionSaleEventInput[] = [];
              for (const sale of salesResult.value) {
                const soldAt = sale.soldAt;
                if (!inRange(soldAt, range)) continue;
                const tokenId = sale.tokenId?.trim();
                if (!tokenId || tokenId === "unknown") {
                  droppedSalesCount += 1;
                  continue;
                }
                const contractAddress = normalizeContractAddress(
                  chainNamespace,
                  sale.contractAddress ?? collectionIdentity.contractAddress
                );
                const soldAtValue = soldAt ?? observedAt;
                normalizedSales.push({
                  collectionIdentityId: collectionIdentity.id,
                  sourceProvider: "reservoir",
                  sourceEndpoint: "/sales/v6",
                  observedAt,
                  ingestedAt,
                  completenessStatus: resolveSalesCompleteness({
                    droppedSalesCount: 0,
                    hadSalesEndpointFailure: false,
                  }),
                  sourceSaleId: sale.sourceSaleId ?? null,
                  chainNamespace,
                  contractAddress,
                  tokenId,
                  transactionHash: sale.transactionHash ?? sale.txHash ?? null,
                  logIndex: sale.logIndex ?? null,
                  eventIndex: sale.eventIndex ?? null,
                  buyerAddress: normalizeAddress(sale.buyerAddress),
                  sellerAddress: normalizeAddress(sale.sellerAddress),
                  priceCurrency: sale.currencySymbol ?? "ETH",
                  priceAmountNative:
                    Number.isFinite(sale.priceEth) && sale.priceEth > 0
                      ? sale.priceEth
                      : null,
                  soldAt: soldAtValue,
                  marketplace: sale.marketplace ?? null,
                });
              }

              if (normalizedSales.length > 0) {
                const completenessStatus = resolveSalesCompleteness({
                  droppedSalesCount,
                  hadSalesEndpointFailure: false,
                });
                saleEvents = await options.facts.upsertCollectionSaleEvents(
                  normalizedSales.map((sale) => ({
                    ...sale,
                    completenessStatus,
                  }))
                );
              } else {
                saleEvents = Object.freeze([]);
              }

              componentResults.sales = {
                status: droppedSalesCount > 0 ? "partial" : "success",
                details:
                  droppedSalesCount > 0
                    ? `Persisted ${saleEvents.length} sales; dropped ${droppedSalesCount} incomplete rows.`
                    : `Persisted ${saleEvents.length} sales.`,
              };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown sales ingestion error.";
            errors.push(`Sales ingestion failed: ${message}`);
            componentResults.sales = {
              status: "failure",
              details: message,
            };
          }

          // Trait aggregate facts
          try {
            const includeTraits = request.includeTraits ?? true;
            const traitInput = buildTraitsSnapshotInput({
              collectionIdentityId: collectionIdentity.id,
              observedAt,
              ingestedAt,
              includeTraits,
              collection,
            });
            if (!traitInput) {
              componentResults.traits = {
                status: "skipped",
                details: "Trait ingestion explicitly disabled for this run.",
              };
            } else {
              const written = await options.facts.upsertCollectionTraitSnapshots([
                traitInput,
              ]);
              traitSnapshot = written[0] ?? null;
              componentResults.traits = {
                status:
                  traitInput.completenessStatus === "complete" ? "success" : "partial",
                details:
                  traitInput.completenessStatus === "complete"
                    ? "Trait aggregate snapshot persisted."
                    : "Trait aggregate snapshot persisted with partial metadata.",
              };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown trait ingestion error.";
            errors.push(`Trait ingestion failed: ${message}`);
            componentResults.traits = {
              status: "failure",
              details: message,
            };
          }
        }

        const syncFailed =
          errors.length > 0 ||
          componentResults.collection.status === "failure" ||
          componentResults.market.status === "failure" ||
          componentResults.sales.status === "failure";

        completedSyncRun = await options.facts.completeCollectionFactSyncRun({
          syncRunId: syncRun.id,
          syncStatus: syncFailed ? "failure" : "success",
          syncCompletedAt: nowIso(now),
          errorMessage: syncFailed ? errors[0] ?? "Reservoir ingestion failed." : null,
          errorMetadata: syncFailed
            ? {
                collectionRef,
                componentResults,
                droppedSalesCount,
                errors,
              }
            : null,
        });

        return {
          syncRun: completedSyncRun,
          collectionIdentity,
          aliases,
          marketSnapshot,
          saleEvents,
          droppedSalesCount,
          traitSnapshot,
          componentResults,
          errors: Object.freeze(errors),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected Reservoir ingestion failure.";

        completedSyncRun = await options.facts.completeCollectionFactSyncRun({
          syncRunId: syncRun.id,
          syncStatus: "failure",
          syncCompletedAt: nowIso(now),
          errorMessage: message,
          errorMetadata: {
            collectionRef,
            componentResults,
            droppedSalesCount,
            errors: [...errors, message],
          },
        });

        return {
          syncRun: completedSyncRun,
          collectionIdentity,
          aliases,
          marketSnapshot,
          saleEvents,
          droppedSalesCount,
          traitSnapshot,
          componentResults,
          errors: Object.freeze([...errors, message]),
        };
      }
    },
  };
}

export function createDefaultReservoirCollectionFactsIngestionService(options: {
  facts: CollectionFactsRepository;
  reservoirApiKey?: string;
  now?: () => Date;
}): ReservoirCollectionFactsIngestionService {
  return createReservoirCollectionFactsIngestionService({
    facts: options.facts,
    reservoir: new ReservoirProvider(options.reservoirApiKey),
    now: options.now,
  });
}
