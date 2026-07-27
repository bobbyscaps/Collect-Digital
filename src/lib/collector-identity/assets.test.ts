import assert from "node:assert/strict";
import test from "node:test";

import {
  createCollectorIdentityAssetService,
  normalizeMediaUrl,
} from "@/lib/collector-identity/assets";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";

function holding(overrides: Partial<NormalizedHolding> = {}): NormalizedHolding {
  return {
    id: "holding-1",
    walletId: "wallet-1",
    chainNamespace: "eip155",
    contractAddress: "0xabc0000000000000000000000000000000000000",
    tokenId: "1",
    assetStandard: "erc721",
    quantity: "1",
    collectionId: "eip155:0xabc0000000000000000000000000000000000000",
    ownerAddress: "0xowner",
    acquiredAt: null,
    lastSeenAt: "2026-07-25T12:00:00.000Z",
    sourceProvider: "test",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

test("asset service builds deterministic fallback assets without remote fetch", async () => {
  const service = createCollectorIdentityAssetService({
    enableRemoteFetch: false,
  });
  const assets = await service.buildAssets([
    holding(),
    holding({ id: "holding-2", walletId: "wallet-2" }),
  ]);

  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetId, "eip155:0xabc0000000000000000000000000000000000000:1");
  assert.equal(assets[0].receivedAt, null);
  assert.equal(assets[0].listedPriceEth, null);
  assert.equal(assets[0].highestOfferEth, null);
  assert.equal(assets[0].rarityRank, null);
  assert.equal(assets[0].name, null);
  assert.equal(assets[0].collectionName, null);
  assert.equal(
    assets[0].openseaUrl,
    "https://opensea.io/assets/ethereum/0xabc0000000000000000000000000000000000000/1"
  );
});

test("asset service maps reservoir token and trait floor metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/tokens/v7")) {
      return new Response(
        JSON.stringify({
          tokens: [
            {
              token: {
                chain: "ethereum",
                contract: "0xABC0000000000000000000000000000000000000",
                tokenId: "0x1",
                name: "Test NFT",
                image: "ipfs://QmYwAPJzv5CZsnAzt8auVZRn4P4n8vkg8f9Vf9k6fQxJvG",
                collection: {
                  name: "Test Collection",
                  floorAskPrice: { amount: { native: 1.2 } },
                },
                rarityRank: 42,
                attributes: [
                  { key: "Background", value: "Blue", floorAskPrice: { amount: { native: 0.4 } } },
                  { key: "Hat", value: "Gold", floorAskPrice: { amount: { native: 0.9 } } },
                ],
              },
              market: {
                floorAsk: { price: { amount: { native: 1.1 } } },
                topBid: { price: { amount: { native: 0.95 } } },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes("/collections/v7")) {
      return new Response(
        JSON.stringify({
          collections: [
            {
              name: "Test Collection",
              floorAsk: { price: { amount: { native: 1.2 } } },
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService();
    const assets = await service.buildAssets([
      holding({ tokenId: "0x1" }),
    ]);

    assert.equal(assets.length, 1);
    assert.equal(assets[0].assetId, "eip155:0xabc0000000000000000000000000000000000000:1");
    assert.equal(assets[0].name, "Test NFT");
    assert.equal(
      assets[0].imageUrl,
      "https://ipfs.io/ipfs/QmYwAPJzv5CZsnAzt8auVZRn4P4n8vkg8f9Vf9k6fQxJvG"
    );
    assert.equal(assets[0].listedPriceEth, 1.1);
    assert.equal(assets[0].highestOfferEth, 0.95);
    assert.equal(assets[0].rarityRank, 42);
    assert.equal(assets[0].collectionName, "Test Collection");
    assert.equal(assets[0].collectionFloorPriceEth, 1.2);
    assert.equal(assets[0].topTraitFloor?.traitType, "Hat");
    assert.equal(assets[0].topTraitFloor?.traitValue, "Gold");
    assert.equal(assets[0].topTraitFloor?.floorPriceEth, 0.9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("media URL normalization supports https, ipfs, arweave, and missing values", () => {
  assert.equal(
    normalizeMediaUrl("https://cdn.example.com/image.png"),
    "https://cdn.example.com/image.png"
  );
  assert.equal(
    normalizeMediaUrl("ipfs://ipfs/Qmabcdef1234567890"),
    "https://ipfs.io/ipfs/Qmabcdef1234567890"
  );
  assert.equal(
    normalizeMediaUrl("ar://abc123"),
    "https://arweave.net/abc123"
  );
  assert.equal(normalizeMediaUrl(""), null);
  assert.equal(normalizeMediaUrl(null), null);
});
