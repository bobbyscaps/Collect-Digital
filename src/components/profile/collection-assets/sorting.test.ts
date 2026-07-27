import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_SORT_OPTIONS,
  sortAssets,
} from "@/components/profile/collection-assets/sorting";
import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

function asset(
  assetId: string,
  overrides: Partial<CollectorIdentityAssetData> = {}
): CollectorIdentityAssetData {
  return {
    assetId,
    chainNamespace: "eip155",
    contractAddress: "0xabc0000000000000000000000000000000000000",
    tokenId: assetId,
    receivedAt: null,
    listedPriceEth: null,
    highestOfferEth: null,
    highestOfferScope: null,
    rarityRank: null,
    name: null,
    imageUrl: null,
    collectionName: null,
    collectionFloorPriceEth: null,
    topTraitFloor: null,
    openseaUrl: "https://opensea.io/assets/ethereum/0xabc/1",
    ...overrides,
  };
}

test("sortAssets supports all configured sort options", () => {
  const alpha = asset("a", {
    receivedAt: "2026-01-03T00:00:00.000Z",
    name: "Alpha",
    listedPriceEth: 2,
    highestOfferEth: 1.2,
    rarityRank: 10,
    collectionName: "Zeta",
    collectionFloorPriceEth: 0.5,
    topTraitFloor: { traitType: "Hat", traitValue: "Gold", floorPriceEth: 0.9 },
  });
  const beta = asset("b", {
    receivedAt: "2026-01-01T00:00:00.000Z",
    name: "Beta",
    listedPriceEth: 1,
    highestOfferEth: 0.4,
    rarityRank: 100,
    collectionName: "Acme",
    collectionFloorPriceEth: 2.5,
    topTraitFloor: { traitType: "Eyes", traitValue: "Laser", floorPriceEth: 0.2 },
  });
  const missing = asset("c");
  const input = [alpha, beta, missing] as const;
  const originalOrder = input.map((item) => item.assetId);

  const expectedFirst: Record<string, string> = {
    recently_received: "a",
    oldest_received: "b",
    name_asc: "a",
    name_desc: "b",
    highest_listed_price: "a",
    lowest_listed_price: "b",
    highest_offer: "a",
    lowest_offer: "b",
    most_rare: "a",
    least_rare: "b",
    collection_name_asc: "b",
    collection_name_desc: "a",
    highest_collection_floor: "b",
    lowest_collection_floor: "a",
    highest_trait_floor: "a",
    lowest_trait_floor: "b",
  };

  for (const option of ASSET_SORT_OPTIONS) {
    const sorted = sortAssets(input, option.value);
    assert.notEqual(sorted, input, `${option.value} should return a new array`);
    assert.deepEqual(
      input.map((item) => item.assetId),
      originalOrder,
      `${option.value} must not mutate original array`
    );
    assert.equal(
      sorted[0].assetId,
      expectedFirst[option.value],
      `${option.value} should sort expected first asset`
    );
    assert.equal(
      sorted[sorted.length - 1].assetId,
      "c",
      `${option.value} should place unavailable values last`
    );
  }
});

test("sortAssets is stable when values are equal", () => {
  const one = asset("1", { name: "Equal", listedPriceEth: 1 });
  const two = asset("2", { name: "Equal", listedPriceEth: 1 });
  const three = asset("3", { name: "Other", listedPriceEth: 2 });

  const sortedName = sortAssets([one, two, three], "name_asc");
  assert.deepEqual(
    sortedName.map((item) => item.assetId),
    ["1", "2", "3"]
  );

  const sortedPrice = sortAssets([one, two, three], "highest_listed_price");
  assert.deepEqual(
    sortedPrice.map((item) => item.assetId),
    ["3", "1", "2"]
  );
});
