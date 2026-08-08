import assert from "node:assert/strict";
import test from "node:test";

import { env } from "@/lib/env";
import {
  createInMemoryCollectionFactsRepository,
  type CollectionFactsRepository,
} from "@/lib/collection-facts/repository";
import { createSupabaseCollectionFactsRepository } from "@/lib/collection-facts/supabase-repository";
import type { CollectionDerivedSignalKey } from "@/lib/collection-signals/domain";
import {
  createInMemoryCollectionSignalRepository,
  type CollectionSignalRepository,
} from "@/lib/collection-signals/repository";
import { createSupabaseCollectionSignalRepository } from "@/lib/collection-signals/supabase-repository";
import { createCollectionSignalService } from "@/lib/collection-signals/service";

type RepositoryTarget = {
  name: string;
  create: () => {
    signals: CollectionSignalRepository;
    facts: CollectionFactsRepository;
  };
  skipReason?: string;
};

const supabaseEnabled = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
);

const repositoryTargets: readonly RepositoryTarget[] = [
  {
    name: "in-memory",
    create: () => ({
      signals: createInMemoryCollectionSignalRepository(),
      facts: createInMemoryCollectionFactsRepository(),
    }),
  },
  {
    name: "supabase",
    create: () => ({
      signals: createSupabaseCollectionSignalRepository(),
      facts: createSupabaseCollectionFactsRepository(),
    }),
    skipReason: supabaseEnabled
      ? undefined
      : "Supabase credentials not configured in this environment.",
  },
];

async function createCollectionIdentity(
  facts: CollectionFactsRepository,
  contractAddress: string
): Promise<{ id: string; contractAddress: string; canonicalId: string }> {
  const { identity } = await facts.upsertCollectionIdentity({
    chainNamespace: "eip155",
    contractAddress,
    aliases: [
      {
        provider: "reservoir",
        aliasKind: "slug",
        aliasValue: `test-${contractAddress.slice(-6)}`,
      },
    ],
  });
  return {
    id: identity.id,
    contractAddress: identity.contractAddress,
    canonicalId: identity.canonicalId,
  };
}

function signalByKey<T extends { signalKey: CollectionDerivedSignalKey }>(
  values: readonly T[],
  key: CollectionDerivedSignalKey
): T {
  const match = values.find((value) => value.signalKey === key);
  assert.ok(match, `Signal ${key} should exist.`);
  return match;
}

for (const target of repositoryTargets) {
  test(
    `[${target.name}] signal repository supports upsert determinism and version retention`,
    { skip: target.skipReason },
    async () => {
      const { signals, facts } = target.create();
      const identity = await createCollectionIdentity(
        facts,
        "0x0000000000000000000000000000000000000a11"
      );

      await signals.upsertCollectionSignalValues([
        {
          collectionIdentityId: identity.id,
          signalKey: "listing_pressure",
          calculationVersion: "listing_pressure:v1",
          numericValue: 2.5,
          computedAt: "2026-08-30T00:00:00.000Z",
          sourceWindowStart: "2026-08-30T00:00:00.000Z",
          sourceWindowEnd: "2026-08-30T00:00:00.000Z",
          completenessStatus: "complete",
        },
      ]);
      await signals.upsertCollectionSignalValues([
        {
          collectionIdentityId: identity.id,
          signalKey: "listing_pressure",
          calculationVersion: "listing_pressure:v1",
          numericValue: 2.8,
          computedAt: "2026-08-30T00:00:00.000Z",
          sourceWindowStart: "2026-08-30T00:00:00.000Z",
          sourceWindowEnd: "2026-08-30T00:00:00.000Z",
          completenessStatus: "complete",
        },
      ]);
      await signals.upsertCollectionSignalValues([
        {
          collectionIdentityId: identity.id,
          signalKey: "listing_pressure",
          calculationVersion: "listing_pressure:v2",
          numericValue: 2.9,
          computedAt: "2026-09-01T00:00:00.000Z",
          sourceWindowStart: "2026-09-01T00:00:00.000Z",
          sourceWindowEnd: "2026-09-01T00:00:00.000Z",
          completenessStatus: "complete",
        },
      ]);

      const all = await signals.listCollectionSignalValues(identity.id, [
        "listing_pressure",
      ]);
      assert.equal(all.length, 2);
      const latest = await signals.listLatestCollectionSignalValues(identity.id);
      const latestListingPressure = signalByKey(latest, "listing_pressure");
      assert.equal(latestListingPressure.calculationVersion, "listing_pressure:v2");
      assert.equal(latestListingPressure.numericValue, 2.9);
    }
  );
}

test("service computes near-floor liquidity complete/partial/unknown honestly", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000b11"
  );

  await facts.upsertCollectionMarketSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-08-01T00:00:00.000Z",
      completenessStatus: "complete",
      nearFloorOfferValueNative: 55.5,
    },
  ]);

  const complete = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "near_floor_bid_liquidity",
    evaluatedAt: "2026-08-02T00:00:00.000Z",
  });
  assert.equal(complete.numericValue, 55.5);
  assert.equal(complete.completenessStatus, "complete");

  await facts.upsertCollectionMarketSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-08-03T00:00:00.000Z",
      completenessStatus: "partial",
      nearFloorOfferValueNative: null,
    },
  ]);
  const partial = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "near_floor_bid_liquidity",
    evaluatedAt: "2026-08-04T00:00:00.000Z",
  });
  assert.equal(partial.numericValue, null);
  assert.equal(partial.completenessStatus, "partial");
});

test("service computes 30-day volume with deterministic boundary and missing-price exclusion", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000c11"
  );
  const evaluatedAt = "2026-09-01T00:00:00.000Z";

  await facts.upsertCollectionSaleEvents([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: evaluatedAt,
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "1",
      soldAt: "2026-08-02T00:00:00.000Z",
      priceAmountNative: 2,
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: evaluatedAt,
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "2",
      soldAt: "2026-08-01T00:00:00.000Z",
      priceAmountNative: 1.5,
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: evaluatedAt,
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "3",
      soldAt: "2026-07-31T23:59:59.999Z",
      priceAmountNative: 9,
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: evaluatedAt,
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "4",
      soldAt: "2026-08-15T00:00:00.000Z",
      priceAmountNative: null,
    },
  ]);

  const volumeSignal = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "trading_volume_30d",
    evaluatedAt,
  });
  assert.equal(volumeSignal.numericValue, 2);
  assert.equal(volumeSignal.completenessStatus, "partial");
  assert.deepEqual(volumeSignal.metadata?.qualifyingSaleCount, 1);
});

test("service computes listing pressure ratio and provider fallback safely", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000d11"
  );

  await facts.upsertCollectionMarketSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      completenessStatus: "complete",
      activeListingCount: 0,
      totalSupply: 10000,
      listedPct: 0,
    },
  ]);

  const zeroListingSignal = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "listing_pressure",
    evaluatedAt: "2026-09-01T00:01:00.000Z",
  });
  assert.equal(zeroListingSignal.numericValue, 0);
  assert.equal(zeroListingSignal.completenessStatus, "complete");

  await facts.upsertCollectionMarketSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-02T00:00:00.000Z",
      completenessStatus: "complete",
      activeListingCount: null,
      totalSupply: 0,
      listedPct: 2.75,
    },
  ]);

  const fallbackSignal = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "listing_pressure",
    evaluatedAt: "2026-09-02T00:01:00.000Z",
  });
  assert.equal(fallbackSignal.numericValue, 2.75);
  assert.equal(fallbackSignal.completenessStatus, "partial");
  assert.equal(fallbackSignal.metadata?.method, "provider_listed_pct_fallback");
});

test("service computes collector demand quality components deterministically", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000e11"
  );

  await facts.upsertCollectionSaleEvents([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "1",
      soldAt: "2026-08-20T00:00:00.000Z",
      priceAmountNative: 2,
      buyerAddress: "0xBuyerA",
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "2",
      soldAt: "2026-08-21T00:00:00.000Z",
      priceAmountNative: 1.5,
      buyerAddress: "0xBuyerA",
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "3",
      soldAt: "2026-08-22T00:00:00.000Z",
      priceAmountNative: 1.2,
      buyerAddress: "0xBuyerB",
    },
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "4",
      soldAt: "2026-08-23T00:00:00.000Z",
      priceAmountNative: 2.1,
      buyerAddress: null,
    },
  ]);

  const demandSignal = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "collector_demand_quality",
    evaluatedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(demandSignal.completenessStatus, "partial");
  const structured = demandSignal.structuredValue;
  assert.ok(structured);
  const uniqueBuyer = structured.uniqueBuyerCount as { value: number };
  assert.equal(uniqueBuyer.value, 2);
  const repeat = structured.repeatBuyerConcentration as { value: number };
  assert.ok(Math.abs(repeat.value - (1 - 2 / 3)) < 1e-9);
  const aboveFloor = structured.salesAboveFloorPct as { value: null; status: string };
  assert.equal(aboveFloor.value, null);
  assert.equal(aboveFloor.status, "unknown");
});

test("service computes trait diversity index and layer complexity with partial handling", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000f11"
  );

  await facts.upsertCollectionTraitSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      completenessStatus: "complete",
      traitCategoryCount: 10,
      distinctTraitValueCount: 250,
      reportedSupply: 10000,
    },
  ]);

  const diversity = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "trait_diversity_index",
    evaluatedAt: "2026-09-01T00:01:00.000Z",
  });
  assert.equal(diversity.completenessStatus, "complete");
  assert.ok(diversity.numericValue != null);
  assert.ok(Math.abs(diversity.numericValue - 0.0025) < 1e-12);
  assert.equal(diversity.calculationVersion, "trait_diversity_index:v1");

  const complexity = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "layer_complexity",
    evaluatedAt: "2026-09-01T00:01:00.000Z",
  });
  assert.equal(complexity.numericValue, 10);
  assert.equal(complexity.completenessStatus, "complete");

  await facts.upsertCollectionTraitSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-02T00:00:00.000Z",
      completenessStatus: "partial",
      traitCategoryCount: null,
      distinctTraitValueCount: null,
      reportedSupply: null,
    },
  ]);

  const partialDiversity = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "trait_diversity_index",
    evaluatedAt: "2026-09-02T00:01:00.000Z",
  });
  assert.equal(partialDiversity.numericValue, null);
  assert.equal(partialDiversity.completenessStatus, "partial");

  const partialComplexity = await service.computeCollectionSignal({
    collectionIdentityId: identity.id,
    signalKey: "layer_complexity",
    evaluatedAt: "2026-09-02T00:01:00.000Z",
  });
  assert.equal(partialComplexity.numericValue, null);
  assert.equal(partialComplexity.completenessStatus, "partial");
});

test("service computes and persists full MVP signal batch deterministically", async () => {
  const facts = createInMemoryCollectionFactsRepository();
  const signals = createInMemoryCollectionSignalRepository();
  const service = createCollectionSignalService({
    factsRepository: facts,
    signalRepository: signals,
  });
  const identity = await createCollectionIdentity(
    facts,
    "0x0000000000000000000000000000000000000a22"
  );

  await facts.upsertCollectionMarketSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      completenessStatus: "complete",
      nearFloorOfferValueNative: 40,
      activeListingCount: 300,
      totalSupply: 10000,
      listedPct: 3,
    },
  ]);
  await facts.upsertCollectionTraitSnapshots([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      completenessStatus: "complete",
      traitCategoryCount: 8,
      distinctTraitValueCount: 200,
      reportedSupply: 10000,
    },
  ]);
  await facts.upsertCollectionSaleEvents([
    {
      collectionIdentityId: identity.id,
      sourceProvider: "reservoir",
      observedAt: "2026-09-01T00:00:00.000Z",
      chainNamespace: "eip155",
      contractAddress: identity.contractAddress,
      tokenId: "1",
      soldAt: "2026-08-20T00:00:00.000Z",
      priceAmountNative: 2,
      buyerAddress: "0xBuyerA",
    },
  ]);

  const first = await service.computeMvpCollectionSignalBatch({
    collectionIdentityId: identity.id,
    evaluatedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(first.length, 6);

  const second = await service.computeMvpCollectionSignalBatch({
    collectionIdentityId: identity.id,
    evaluatedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(second.length, 6);

  const allRows = await signals.listCollectionSignalValues(identity.id);
  assert.equal(allRows.length, 6);
  const latestRows = await service.listLatestCollectionSignals(identity.id);
  assert.equal(latestRows.length, 6);
});
