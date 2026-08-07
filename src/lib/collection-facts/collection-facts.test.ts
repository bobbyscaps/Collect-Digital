import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { env } from "@/lib/env";
import {
  normalizeCollectionAliasValue,
  toCollectionCanonicalId,
  toCollectionSaleEventId,
} from "@/lib/collection-facts/domain";
import {
  createInMemoryCollectionFactsRepository,
  type CollectionFactsRepository,
} from "@/lib/collection-facts/repository";
import { createSupabaseCollectionFactsRepository } from "@/lib/collection-facts/supabase-repository";

type RepositoryTarget = {
  name: string;
  create: () => CollectionFactsRepository;
  skipReason?: string;
};

const supabaseEnabled = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
);

const repositoryTargets: readonly RepositoryTarget[] = [
  {
    name: "in-memory",
    create: () => createInMemoryCollectionFactsRepository(),
  },
  {
    name: "supabase",
    create: () => createSupabaseCollectionFactsRepository(),
    skipReason: supabaseEnabled
      ? undefined
      : "Supabase credentials not configured in this environment.",
  },
];

test("collection identity canonical id is deterministic for EVM addresses", () => {
  const a = toCollectionCanonicalId(
    "eip155",
    "0xABCD1234ABCD1234ABCD1234ABCD1234ABCD1234"
  );
  const b = toCollectionCanonicalId(
    "eip155",
    "0xabcd1234abcd1234abcd1234abcd1234abcd1234"
  );
  assert.equal(a, "eip155:0xabcd1234abcd1234abcd1234abcd1234abcd1234");
  assert.equal(a, b);
});

test("collection identity canonical id preserves non-EVM address case", () => {
  const canonical = toCollectionCanonicalId("solana", "SoLAddressAbC123");
  assert.equal(canonical, "solana:SoLAddressAbC123");
});

test("collection alias normalization is deterministic and non-empty", () => {
  assert.equal(normalizeCollectionAliasValue("  Azuki  "), "azuki");
  assert.throws(() => normalizeCollectionAliasValue("   "), /aliasValue/);
});

test("sale event id prioritizes tx hash + log index", () => {
  const eventId = toCollectionSaleEventId({
    chainNamespace: "eip155",
    sourceProvider: "reservoir",
    contractAddress: "0xabc",
    tokenId: "1",
    transactionHash: "0xABCDEF",
    logIndex: 42,
    soldAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(eventId, "tx:eip155:0xabcdef:42");
});

test("sale event fallback id is deterministic when tx/log are unavailable", () => {
  const left = toCollectionSaleEventId({
    chainNamespace: "eip155",
    sourceProvider: "reservoir",
    contractAddress: "0xabc",
    tokenId: "99",
    buyerAddress: "0xBuyer",
    sellerAddress: "0xSeller",
    priceCurrency: "ETH",
    priceAmountNative: 1.23,
    soldAt: "2026-01-01T00:00:00.000Z",
  });
  const right = toCollectionSaleEventId({
    chainNamespace: "eip155",
    sourceProvider: "reservoir",
    contractAddress: "0xAbC",
    tokenId: "99",
    buyerAddress: "0xBuyer",
    sellerAddress: "0xSeller",
    priceCurrency: "ETH",
    priceAmountNative: 1.23,
    soldAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(left, right);
  assert.match(left, /^fallback:[0-9a-f]{64}$/);
});

for (const target of repositoryTargets) {
  test(
    `[${target.name}] repository contract exposes expected methods`,
    { skip: target.skipReason },
    () => {
      const repository = target.create();
      assert.equal(typeof repository.upsertCollectionIdentity, "function");
      assert.equal(typeof repository.listCollectionIdentityAliases, "function");
      assert.equal(typeof repository.findCollectionIdentityByCanonicalId, "function");
      assert.equal(typeof repository.findCollectionIdentityByAlias, "function");
      assert.equal(typeof repository.upsertCollectionMarketSnapshots, "function");
      assert.equal(typeof repository.listCollectionMarketSnapshots, "function");
      assert.equal(typeof repository.upsertCollectionSaleEvents, "function");
      assert.equal(typeof repository.listCollectionSaleEvents, "function");
      assert.equal(typeof repository.upsertCollectionTraitSnapshots, "function");
      assert.equal(typeof repository.listCollectionTraitSnapshots, "function");
      assert.equal(typeof repository.startCollectionFactSyncRun, "function");
      assert.equal(typeof repository.completeCollectionFactSyncRun, "function");
      assert.equal(typeof repository.findLatestCollectionFactSyncRun, "function");
    }
  );

  test(
    `[${target.name}] collection identity upsert and alias resolution`,
    { skip: target.skipReason },
    async () => {
      const repository = target.create();
      const slugAlias = `azuki-${randomUUID()}`;
      const providerIdAlias = `provider-${randomUUID()}`;
      const created = await repository.upsertCollectionIdentity({
        chainNamespace: "eip155",
        contractAddress: "0xAbCdEfabcdefABCDefabcdefAbcdefabCDefABCD",
        aliases: [
          {
            provider: "reservoir",
            aliasKind: "slug",
            aliasValue: slugAlias,
          },
          {
            provider: "reservoir",
            aliasKind: "provider_id",
            aliasValue: providerIdAlias,
          },
        ],
      });

      assert.equal(
        created.identity.canonicalId,
        "eip155:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      );
      assert.equal(created.aliases.length, 2);

      const byCanonical = await repository.findCollectionIdentityByCanonicalId(
        created.identity.canonicalId
      );
      assert.equal(byCanonical?.id, created.identity.id);

      const bySlugAlias = await repository.findCollectionIdentityByAlias({
        provider: "reservoir",
        aliasKind: "slug",
        aliasValue: slugAlias.toUpperCase(),
      });
      assert.equal(bySlugAlias?.id, created.identity.id);
    }
  );

  test(
    `[${target.name}] market snapshots append history and deduplicate same observation`,
    { skip: target.skipReason },
    async () => {
      const repository = target.create();
      const { identity } = await repository.upsertCollectionIdentity({
        chainNamespace: "eip155",
        contractAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      });

      await repository.upsertCollectionMarketSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/collections/v7",
          observedAt: "2026-08-01T00:00:00.000Z",
          floorPriceNative: 1.5,
          topOfferNative: 1.3,
          activeListingCount: 300,
          listedPct: 3,
          totalSupply: 10000,
          holderCount: 5300,
          completenessStatus: "complete",
        },
      ]);
      await repository.upsertCollectionMarketSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/collections/v7",
          observedAt: "2026-08-01T00:00:00.000Z",
          floorPriceNative: 1.6,
          topOfferNative: 1.35,
          activeListingCount: 310,
          listedPct: 3.1,
          totalSupply: 10000,
          holderCount: 5310,
          completenessStatus: "complete",
        },
      ]);
      await repository.upsertCollectionMarketSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/collections/v7",
          observedAt: "2026-08-02T00:00:00.000Z",
          floorPriceNative: 1.8,
          topOfferNative: 1.4,
          activeListingCount: 290,
          listedPct: 2.9,
          totalSupply: 10000,
          holderCount: 5320,
          completenessStatus: "complete",
        },
      ]);

      const snapshots = await repository.listCollectionMarketSnapshots(identity.id);
      assert.equal(snapshots.length, 2);
      assert.equal(snapshots[0].observedAt, "2026-08-02T00:00:00.000Z");
      assert.equal(snapshots[1].floorPriceNative, 1.6);
      assert.equal(snapshots[1].listedPct, 3.1);
    }
  );

  test(
    `[${target.name}] sale events deduplicate deterministic event identity`,
    { skip: target.skipReason },
    async () => {
      const repository = target.create();
      const { identity } = await repository.upsertCollectionIdentity({
        chainNamespace: "eip155",
        contractAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      });

      await repository.upsertCollectionSaleEvents([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/sales/v6",
          observedAt: "2026-08-03T00:00:00.000Z",
          chainNamespace: "eip155",
          contractAddress: identity.contractAddress,
          tokenId: "123",
          transactionHash: "0xfeedbeef",
          logIndex: 7,
          buyerAddress: "0xbuyer",
          sellerAddress: "0xseller",
          priceCurrency: "ETH",
          priceAmountNative: 2.1,
          soldAt: "2026-08-03T00:00:00.000Z",
          completenessStatus: "complete",
        },
      ]);
      await repository.upsertCollectionSaleEvents([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/sales/v6",
          observedAt: "2026-08-03T00:00:00.000Z",
          chainNamespace: "eip155",
          contractAddress: identity.contractAddress,
          tokenId: "123",
          transactionHash: "0xfeedbeef",
          logIndex: 7,
          buyerAddress: "0xbuyer",
          sellerAddress: "0xseller",
          priceCurrency: "ETH",
          priceAmountNative: 2.2,
          soldAt: "2026-08-03T00:00:00.000Z",
          completenessStatus: "complete",
        },
      ]);

      await repository.upsertCollectionSaleEvents([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/sales/v6",
          observedAt: "2026-08-04T00:00:00.000Z",
          chainNamespace: "eip155",
          contractAddress: identity.contractAddress,
          tokenId: "456",
          buyerAddress: "0xbuyer",
          sellerAddress: "0xseller",
          priceCurrency: "ETH",
          priceAmountNative: 3.5,
          soldAt: "2026-08-04T00:00:00.000Z",
          completenessStatus: "partial",
        },
      ]);
      await repository.upsertCollectionSaleEvents([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "reservoir",
          sourceEndpoint: "/sales/v6",
          observedAt: "2026-08-04T00:00:00.000Z",
          chainNamespace: "eip155",
          contractAddress: identity.contractAddress,
          tokenId: "456",
          buyerAddress: "0xbuyer",
          sellerAddress: "0xseller",
          priceCurrency: "ETH",
          priceAmountNative: 3.5,
          soldAt: "2026-08-04T00:00:00.000Z",
          completenessStatus: "partial",
        },
      ]);

      const events = await repository.listCollectionSaleEvents(identity.id);
      assert.equal(events.length, 2);
      assert.equal(events[0].soldAt, "2026-08-04T00:00:00.000Z");
      assert.equal(events[1].eventId, "tx:eip155:0xfeedbeef:7");
      assert.match(events[0].eventId, /^fallback:[0-9a-f]{64}$/);
    }
  );

  test(
    `[${target.name}] trait snapshots append history and deduplicate same observation`,
    { skip: target.skipReason },
    async () => {
      const repository = target.create();
      const { identity } = await repository.upsertCollectionIdentity({
        chainNamespace: "eip155",
        contractAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      });

      await repository.upsertCollectionTraitSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "simplehash",
          sourceEndpoint: "/nfts/collections",
          observedAt: "2026-08-01T00:00:00.000Z",
          traitCategoryCount: 12,
          distinctTraitValueCount: 380,
          reportedSupply: 10000,
          oneOfOneAssetCount: 10,
          oneOfOneSupplyPct: 0.1,
          completenessStatus: "partial",
        },
      ]);
      await repository.upsertCollectionTraitSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "simplehash",
          sourceEndpoint: "/nfts/collections",
          observedAt: "2026-08-01T00:00:00.000Z",
          traitCategoryCount: 13,
          distinctTraitValueCount: 390,
          reportedSupply: 10000,
          oneOfOneAssetCount: 11,
          oneOfOneSupplyPct: 0.11,
          completenessStatus: "partial",
        },
      ]);
      await repository.upsertCollectionTraitSnapshots([
        {
          collectionIdentityId: identity.id,
          sourceProvider: "simplehash",
          sourceEndpoint: "/nfts/collections",
          observedAt: "2026-08-02T00:00:00.000Z",
          traitCategoryCount: 14,
          distinctTraitValueCount: 405,
          reportedSupply: 10000,
          oneOfOneAssetCount: 12,
          oneOfOneSupplyPct: 0.12,
          completenessStatus: "partial",
        },
      ]);

      const snapshots = await repository.listCollectionTraitSnapshots(identity.id);
      assert.equal(snapshots.length, 2);
      assert.equal(snapshots[0].traitCategoryCount, 14);
      assert.equal(snapshots[1].traitCategoryCount, 13);
    }
  );

  test(
    `[${target.name}] sync runs support start success/failure and latest lookup`,
    { skip: target.skipReason },
    async () => {
      const repository = target.create();
      const started = await repository.startCollectionFactSyncRun({
        sourceProvider: "reservoir",
        sourceEndpoint: "/collections/v7",
        syncScope: "collection_market",
        syncStartedAt: "2026-08-06T10:00:00.000Z",
      });
      assert.equal(started.syncStatus, "running");

      const completed = await repository.completeCollectionFactSyncRun({
        syncRunId: started.id,
        syncStatus: "success",
        syncCompletedAt: "2026-08-06T10:00:02.000Z",
      });
      assert.equal(completed.syncStatus, "success");
      assert.equal(completed.durationMs, 2000);

      const failed = await repository.startCollectionFactSyncRun({
        sourceProvider: "simplehash",
        sourceEndpoint: "/nfts/collections",
        syncStartedAt: "2026-08-06T11:00:00.000Z",
      });
      const failedCompleted = await repository.completeCollectionFactSyncRun({
        syncRunId: failed.id,
        syncStatus: "failure",
        syncCompletedAt: "2026-08-06T11:00:01.000Z",
        errorMessage: "rate limited",
        errorMetadata: { retryAfterSeconds: 30 },
      });
      assert.equal(failedCompleted.syncStatus, "failure");
      assert.equal(failedCompleted.errorMessage, "rate limited");

      const latestAny = await repository.findLatestCollectionFactSyncRun();
      assert.equal(latestAny?.id, failed.id);
      const latestReservoir = await repository.findLatestCollectionFactSyncRun(
        "reservoir"
      );
      assert.equal(latestReservoir?.id, started.id);
    }
  );
}
