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
import { ReservoirProvider } from "@/providers/reservoir/provider";

const DEFAULT_OFFERS_LIMIT = 200;
const DEFAULT_LISTINGS_LIMIT = 200;
const DEFAULT_SALES_LIMIT = 400;
const DEFAULT_NEAR_FLOOR_BAND_PCT = 20;

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

function computeNearFloorOfferValue(input: {
  floorPriceNative: number | null;
  offers: readonly NormalizedOffer[];
  nearFloorBandPct: number;
}): { nearFloorOfferValueNative: number | null; activeOfferCount: number | null } {
  const floor = input.floorPriceNative;
  if (floor == null || floor <= 0) {
    return {
      nearFloorOfferValueNative: null,
      activeOfferCount: input.offers.length,
    };
  }

  const minPrice = floor * (1 - input.nearFloorBandPct / 100);
  const relevantOffers = input.offers.filter(
    (offer) => offer.priceEth >= minPrice && offer.priceEth <= floor
  );
  const nearFloorOfferValueNative = relevantOffers.reduce(
    (total, offer) => total + offer.priceEth,
    0
  );

  return {
    nearFloorOfferValueNative,
    activeOfferCount: input.offers.length,
  };
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
          const offersLimit = request.offersLimit ?? DEFAULT_OFFERS_LIMIT;
          const salesLimit = request.salesLimit ?? DEFAULT_SALES_LIMIT;
          const nearFloorBandPct =
            request.nearFloorBandPct ?? DEFAULT_NEAR_FLOOR_BAND_PCT;

          const [offersResult, listingsResult, salesResult] = await Promise.allSettled([
            options.reservoir.getOffers(collection.slug, { limit: offersLimit }),
            options.reservoir.getListings(collection.slug, { limit: listingsLimit }),
            options.reservoir.getSales(collection.slug, { limit: salesLimit }),
          ]);

          // Market facts
          try {
            const offers =
              offersResult.status === "fulfilled"
                ? offersResult.value
                : ([] as NormalizedOffer[]);
            const listings =
              listingsResult.status === "fulfilled"
                ? listingsResult.value
                : ([] as NormalizedListing[]);

            const nearFloor = computeNearFloorOfferValue({
              floorPriceNative: Number.isFinite(collection.floor)
                ? collection.floor
                : null,
              offers,
              nearFloorBandPct,
            });
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
              offersResult.status === "fulfilled" &&
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
                nearFloorOfferValueNative: nearFloor.nearFloorOfferValueNative,
                activeOfferCount: nearFloor.activeOfferCount,
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

            if (offersResult.status === "rejected") {
              errors.push(
                `Offers endpoint failed: ${
                  offersResult.reason instanceof Error
                    ? offersResult.reason.message
                    : String(offersResult.reason)
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
                offersResult.status === "fulfilled" &&
                (listingsResult.status === "fulfilled" || listedCount != null)
                  ? "success"
                  : "partial",
              details:
                marketCompleteness === "complete"
                  ? "Market snapshot persisted from Reservoir collection/offer/listing facts."
                  : "Market snapshot persisted with partial offer/listing coverage.",
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
