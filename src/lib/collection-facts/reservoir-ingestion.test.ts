import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryCollectionFactsRepository } from "@/lib/collection-facts/repository";
import { createReservoirCollectionFactsIngestionService } from "@/lib/collection-facts/reservoir-ingestion";
import type {
  NormalizedCollection,
  NormalizedListing,
  NormalizedOffer,
  NormalizedSale,
} from "@/providers/types";

type FakeReservoir = {
  getCollection: (collectionId: string) => Promise<NormalizedCollection | null>;
  getOffers: (
    collectionId: string,
    options?: { limit?: number }
  ) => Promise<NormalizedOffer[]>;
  getListings: (
    collectionId: string,
    options?: { limit?: number }
  ) => Promise<NormalizedListing[]>;
  getSales: (collectionId: string, options?: { limit?: number }) => Promise<NormalizedSale[]>;
};

const BASE_COLLECTION: NormalizedCollection = {
  id: "reservoir-azuki",
  slug: "azuki",
  name: "Azuki",
  image: "https://cdn.example/azuki.png",
  floor: 2,
  topOffer: 1.5,
  holders: 5300,
  sales: 12800,
  liquidity: 2000,
  listedPercent: 3,
  listedCount: 300,
  supply: 10000,
  traitCategoryCount: 12,
  distinctTraitValueCount: 480,
  oneOfOneAssetCount: null,
  volume: 5000,
  metadata: {
    contractAddress: "0xAbCdEfabcdefABCDefabcdefAbcdefabCDefABCD",
    chain: "ethereum",
  },
  provider: "reservoir",
};

function buildFakeReservoir(overrides?: {
  collection?: NormalizedCollection | null;
  offers?: NormalizedOffer[];
  listings?: NormalizedListing[];
  sales?: NormalizedSale[];
  offerError?: Error;
  salesError?: Error;
}): FakeReservoir {
  return {
    async getCollection() {
      return overrides?.collection ?? BASE_COLLECTION;
    },
    async getOffers() {
      if (overrides?.offerError) throw overrides.offerError;
      return (
        overrides?.offers ?? [
          { priceEth: 1.95, marketplace: "opensea" },
          { priceEth: 1.7, marketplace: "blur" },
          { priceEth: 1.3, marketplace: "blur" },
        ]
      );
    },
    async getListings() {
      return overrides?.listings ?? [{ tokenId: "set:azuki", priceEth: 2.1 }];
    },
    async getSales() {
      if (overrides?.salesError) throw overrides.salesError;
      return (
        overrides?.sales ?? [
          {
            tokenId: "1",
            priceEth: 2.2,
            transactionHash: "0xabc1",
            logIndex: 4,
            buyerAddress: "0xBuyer01",
            sellerAddress: "0xSeller01",
            currencySymbol: "ETH",
            soldAt: "2026-08-07T10:00:00.000Z",
            marketplace: "blur",
            contractAddress: BASE_COLLECTION.metadata.contractAddress,
          },
          {
            tokenId: "2",
            priceEth: 2.15,
            sourceSaleId: "sale-2",
            buyerAddress: "0xBuyer02",
            sellerAddress: "0xSeller02",
            currencySymbol: "ETH",
            soldAt: "2026-08-07T11:00:00.000Z",
            marketplace: "opensea",
            contractAddress: BASE_COLLECTION.metadata.contractAddress,
          },
        ]
      );
    },
  };
}

test("reservoir ingestion resolves identity, persists aliases, and is idempotent on rerun", async () => {
  const repository = createInMemoryCollectionFactsRepository();
  const ingestion = createReservoirCollectionFactsIngestionService({
    facts: repository,
    reservoir: buildFakeReservoir(),
  });

  const firstRun = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-07T12:00:00.000Z",
  });
  assert.equal(firstRun.syncRun.syncStatus, "success");
  assert.equal(firstRun.componentResults.collection.status, "success");
  assert.equal(firstRun.collectionIdentity?.canonicalId, "eip155:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  assert.equal(firstRun.aliases.length, 3);
  assert.equal(firstRun.marketSnapshot?.listedPct, 3);
  assert.equal(firstRun.marketSnapshot?.activeListingCount, 300);
  assert.equal(firstRun.marketSnapshot?.nearFloorOfferValueNative, 3.65);
  assert.equal(firstRun.saleEvents.length, 2);
  const eventIds = firstRun.saleEvents.map((event) => event.eventId).sort();
  assert.deepEqual(eventIds, [
    "provider:reservoir:sale-2",
    "tx:eip155:0xabc1:4",
  ]);
  assert.equal(firstRun.traitSnapshot?.traitCategoryCount, 12);
  assert.equal(firstRun.traitSnapshot?.completenessStatus, "complete");

  const secondRun = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-07T12:00:00.000Z",
  });
  assert.equal(secondRun.syncRun.syncStatus, "success");
  assert.equal(secondRun.collectionIdentity?.id, firstRun.collectionIdentity?.id);

  const identity = firstRun.collectionIdentity;
  assert.ok(identity);
  const marketRows = await repository.listCollectionMarketSnapshots(identity.id);
  const salesRows = await repository.listCollectionSaleEvents(identity.id);
  const traitRows = await repository.listCollectionTraitSnapshots(identity.id);
  assert.equal(marketRows.length, 1);
  assert.equal(salesRows.length, 2);
  assert.equal(traitRows.length, 1);
});

test("reservoir ingestion marks sync failure on endpoint partial failure and preserves persisted partial facts", async () => {
  const repository = createInMemoryCollectionFactsRepository();
  const ingestion = createReservoirCollectionFactsIngestionService({
    facts: repository,
    reservoir: buildFakeReservoir({
      offerError: new Error("offer endpoint timeout"),
    }),
  });

  const run = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-07T12:05:00.000Z",
  });

  assert.equal(run.syncRun.syncStatus, "failure");
  assert.equal(run.componentResults.market.status, "partial");
  assert.equal(run.componentResults.sales.status, "success");
  assert.equal(run.errors.length, 1);
  assert.match(run.errors[0] ?? "", /Offers endpoint failed/i);
  assert.equal(run.marketSnapshot?.completenessStatus, "partial");
  assert.equal(run.saleEvents.length, 2);
});

test("reservoir ingestion filters sales by requested historical window", async () => {
  const repository = createInMemoryCollectionFactsRepository();
  const ingestion = createReservoirCollectionFactsIngestionService({
    facts: repository,
    reservoir: buildFakeReservoir({
      sales: [
        {
          tokenId: "1",
          priceEth: 2.2,
          transactionHash: "0xwindow1",
          logIndex: 1,
          buyerAddress: "0xBuyerA",
          sellerAddress: "0xSellerA",
          soldAt: "2026-08-01T00:00:00.000Z",
          contractAddress: BASE_COLLECTION.metadata.contractAddress,
        },
        {
          tokenId: "2",
          priceEth: 2.4,
          transactionHash: "0xwindow2",
          logIndex: 2,
          buyerAddress: "0xBuyerB",
          sellerAddress: "0xSellerB",
          soldAt: "2026-08-20T00:00:00.000Z",
          contractAddress: BASE_COLLECTION.metadata.contractAddress,
        },
      ],
    }),
  });

  const run = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-21T00:00:00.000Z",
    soldAfter: "2026-08-10T00:00:00.000Z",
    soldBefore: "2026-08-21T00:00:00.000Z",
  });
  assert.equal(run.syncRun.syncStatus, "success");
  assert.equal(run.saleEvents.length, 1);
  assert.equal(run.saleEvents[0]?.transactionHash, "0xwindow2");
});

test("reservoir ingestion keeps trait snapshot honest when provider trait aggregates are unavailable", async () => {
  const repository = createInMemoryCollectionFactsRepository();
  const ingestion = createReservoirCollectionFactsIngestionService({
    facts: repository,
    reservoir: buildFakeReservoir({
      collection: {
        ...BASE_COLLECTION,
        traitCategoryCount: null,
        distinctTraitValueCount: null,
        oneOfOneAssetCount: null,
      },
    }),
  });

  const run = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-07T12:10:00.000Z",
  });

  assert.equal(run.syncRun.syncStatus, "success");
  assert.equal(run.componentResults.traits.status, "partial");
  assert.equal(run.traitSnapshot?.traitCategoryCount, null);
  assert.equal(run.traitSnapshot?.distinctTraitValueCount, null);
  assert.equal(run.traitSnapshot?.oneOfOneAssetCount, null);
  assert.equal(run.traitSnapshot?.completenessStatus, "partial");
});

test("reservoir ingestion marks sales component partial when invalid sales are dropped", async () => {
  const repository = createInMemoryCollectionFactsRepository();
  const ingestion = createReservoirCollectionFactsIngestionService({
    facts: repository,
    reservoir: buildFakeReservoir({
      sales: [
        {
          tokenId: "unknown",
          priceEth: 1.2,
          soldAt: "2026-08-07T10:00:00.000Z",
        },
        {
          tokenId: "5",
          priceEth: 2,
          transactionHash: "0xvalid",
          logIndex: 3,
          soldAt: "2026-08-07T11:00:00.000Z",
          contractAddress: BASE_COLLECTION.metadata.contractAddress,
        },
      ],
    }),
  });

  const run = await ingestion.ingestCollectionFacts({
    collectionRef: "azuki",
    observedAt: "2026-08-07T12:15:00.000Z",
  });
  assert.equal(run.syncRun.syncStatus, "success");
  assert.equal(run.componentResults.sales.status, "partial");
  assert.equal(run.droppedSalesCount, 1);
  assert.equal(run.saleEvents.length, 1);
});
