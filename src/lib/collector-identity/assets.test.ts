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
  assert.equal(assets[0].highestOfferScope, null);
  assert.equal(assets[0].rarityRank, null);
  assert.equal(assets[0].name, null);
  assert.equal(assets[0].collectionName, null);
  assert.equal(
    assets[0].openseaUrl,
    "https://opensea.io/assets/ethereum/0xabc0000000000000000000000000000000000000/1"
  );
});

test("asset service maps reservoir token metadata and rarest trait", async () => {
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
                  { key: "Background", value: "Blue", tokenCount: 120, prevalence: 12.5 },
                  { key: "Hat", value: "Gold", tokenCount: 5, prevalence: 0.5 },
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
    assert.equal(assets[0].highestOfferScope, "unknown");
    assert.equal(assets[0].rarityRank, 42);
    assert.equal(assets[0].collectionName, "Test Collection");
    assert.equal(assets[0].collectionFloorPriceEth, 1.2);
    assert.equal(assets[0].rarestTrait?.traitType, "Hat");
    assert.equal(assets[0].rarestTrait?.traitValue, "Gold");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rarest trait tie-break is deterministic when rarity signals are equal", async () => {
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
                tokenId: "1",
                attributes: [
                  { key: "Trait A", value: "Value 1", tokenCount: 10, prevalence: 1 },
                  { key: "Trait B", value: "Value 2", tokenCount: 10, prevalence: 1 },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes("/collections/v7")) {
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService();
    const firstRun = await service.buildAssets([holding({ tokenId: "1" })]);
    const secondRun = await service.buildAssets([holding({ tokenId: "1" })]);

    assert.deepEqual(firstRun[0].rarestTrait, secondRun[0].rarestTrait);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rarest trait remains unavailable when attributes lack rarity statistics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/tokens/v7")) {
      return new Response(JSON.stringify({ tokens: [] }), { status: 200 });
    }
    if (url.includes("/collections/v7")) {
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }
    if (url.includes("/getNFTMetadata")) {
      return new Response(
        JSON.stringify({
          name: "Static Trait NFT",
          collection: { name: "Static Trait Collection" },
          raw: {
            metadata: {
              attributes: [
                { trait_type: "Background", value: "Blue" },
                { trait_type: "Body", value: "Robot" },
              ],
            },
          },
        }),
        { status: 200 }
      );
    }
    if (url.includes("/getFloorPrice")) {
      return new Response(
        JSON.stringify({
          openSea: { floorPrice: null, error: "not available" },
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    const assets = await service.buildAssets([holding({ tokenId: "99" })]);
    assert.equal(assets[0].rarestTrait, null);
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

test("collection floor uses collection-level field only", async () => {
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
                tokenId: "1",
                name: "Token Name",
                collection: {
                  name: "Collection Name",
                  floorAskPrice: { amount: { native: 2.5 } },
                },
              },
              market: {
                floorAsk: { price: { amount: { native: 0.4 } } },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes("/collections/v7")) {
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    const assets = await service.buildAssets([holding({ tokenId: "1" })]);
    assert.equal(assets[0].listedPriceEth, 0.4);
    assert.equal(assets[0].collectionFloorPriceEth, 2.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("highest offer scope distinguishes token, collection, and trait offers", async () => {
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
                contract: "0xabc0000000000000000000000000000000000011",
                tokenId: "1",
                name: "Token Bid",
              },
              market: {
                topBid: {
                  tokenSetId: "token:0xabc0000000000000000000000000000000000011:1",
                  price: { amount: { native: 0.1 } },
                },
              },
            },
            {
              token: {
                chain: "ethereum",
                contract: "0xabc0000000000000000000000000000000000022",
                tokenId: "2",
                name: "Collection Bid",
              },
              market: {
                topBid: {
                  tokenSetId: "contract:0xabc0000000000000000000000000000000000022",
                  price: { amount: { native: 0.2 } },
                },
              },
            },
            {
              token: {
                chain: "ethereum",
                contract: "0xabc0000000000000000000000000000000000033",
                tokenId: "3",
                name: "Trait Bid",
              },
              market: {
                topBid: {
                  tokenSetId:
                    "attribute:0xabc0000000000000000000000000000000000033:Background:Blue",
                  price: { amount: { native: 0.3 } },
                },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (url.includes("/collections/v7")) {
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    const assets = await service.buildAssets([
      holding({
        contractAddress: "0xabc0000000000000000000000000000000000011",
        tokenId: "1",
        collectionId: "eip155:0xabc0000000000000000000000000000000000011",
      }),
      holding({
        contractAddress: "0xabc0000000000000000000000000000000000022",
        tokenId: "2",
        collectionId: "eip155:0xabc0000000000000000000000000000000000022",
      }),
      holding({
        contractAddress: "0xabc0000000000000000000000000000000000033",
        tokenId: "3",
        collectionId: "eip155:0xabc0000000000000000000000000000000000033",
      }),
    ]);

    const byId = new Map(assets.map((asset) => [asset.tokenId, asset]));
    assert.equal(byId.get("1")?.highestOfferScope, "token");
    assert.equal(byId.get("2")?.highestOfferScope, "collection");
    assert.equal(byId.get("3")?.highestOfferScope, "trait");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("asset service falls back to alchemy metadata when reservoir fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: unknown[] = [];
  const urls: string[] = [];

  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    urls.push(url);

    if (url.includes("/tokens/v7")) {
      return new Response(
        JSON.stringify({ error: { code: 429, message: "rate limited" } }),
        { status: 200 }
      );
    }

    if (url.includes("/collections/v7")) {
      return new Response(
        JSON.stringify({ error: { message: "metadata unavailable" } }),
        { status: 200 }
      );
    }

    if (url.includes("/getNFTMetadata")) {
      return new Response(
        JSON.stringify({
          name: "Alchemy NFT",
          image: {
            cachedUrl: "https://cdn.alchemy.test/asset.png",
          },
          collection: {
            name: "Alchemy Collection",
          },
          contract: {
            openSeaMetadata: {
              floorPrice: 1.75,
              collectionName: "Alchemy Collection",
            },
          },
        }),
        { status: 200 }
      );
    }
    if (url.includes("/getFloorPrice")) {
      return new Response(
        JSON.stringify({
          openSea: { floorPrice: 2.25, error: null },
          looksRare: { floorPrice: null, error: null },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    const assets = await service.buildAssets([
      holding({
        contractAddress: "0xabc0000000000000000000000000000000000001",
        tokenId: "42",
      }),
    ]);

    assert.equal(assets.length, 1);
    assert.equal(
      assets[0].assetId,
      "eip155:0xabc0000000000000000000000000000000000001:42"
    );
    assert.equal(assets[0].contractAddress, "0xabc0000000000000000000000000000000000001");
    assert.equal(assets[0].tokenId, "42");
    assert.equal(assets[0].name, "Alchemy NFT");
    assert.equal(assets[0].imageUrl, "https://cdn.alchemy.test/asset.png");
    assert.equal(assets[0].collectionName, "Alchemy Collection");
    assert.equal(assets[0].collectionFloorPriceEth, 2.25);

    const alchemyUrl = urls.find((item) => item.includes("/getNFTMetadata"));
    assert.ok(alchemyUrl);
    assert.match(alchemyUrl ?? "", /eth-mainnet\.g\.alchemy\.com/);
    assert.match(alchemyUrl ?? "", /contractAddress=0xabc0000000000000000000000000000000000001/);
    assert.match(alchemyUrl ?? "", /tokenId=42/);

    const warningText = JSON.stringify(warnings);
    assert.match(warningText, /reservoir metadata API error/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("alchemy getFloorPrice overrides stale contract metadata floor", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/tokens/v7")) {
      return new Response(JSON.stringify({ tokens: [] }), { status: 200 });
    }
    if (url.includes("/collections/v7")) {
      return new Response(JSON.stringify({ collections: [] }), { status: 200 });
    }
    if (url.includes("/getNFTMetadata")) {
      return new Response(
        JSON.stringify({
          name: "Stale Floor NFT",
          image: { cachedUrl: "https://cdn.alchemy.test/stale.png" },
          collection: { name: "Floor Collection" },
          contract: { openSeaMetadata: { floorPrice: 0.5, collectionName: "Floor Collection" } },
        }),
        { status: 200 }
      );
    }
    if (url.includes("/getFloorPrice")) {
      return new Response(
        JSON.stringify({
          openSea: { floorPrice: 1.25, error: null },
          looksRare: { floorPrice: null, error: "unsupported" },
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    const assets = await service.buildAssets([holding({ tokenId: "9" })]);
    assert.equal(assets[0].collectionFloorPriceEth, 1.25);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("asset service does not query alchemy metadata for non-eip155 assets", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    urls.push(url);
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  try {
    const service = createCollectorIdentityAssetService({
      reservoirApiKey: "reservoir-test",
      alchemyApiKey: "alchemy-test",
    });
    await service.buildAssets([
      holding({
        chainNamespace: "solana",
        contractAddress: "So11111111111111111111111111111111111111112",
        tokenId: "9",
        collectionId: "solana:So11111111111111111111111111111111111111112",
      }),
    ]);

    assert.equal(
      urls.some((url) => url.includes("/getNFTMetadata")),
      false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
