import assert from "node:assert/strict";
import test from "node:test";

import { env } from "@/lib/env";
import {
  createAlchemyEvmRawHoldingsFetcher,
  ALCHEMY_ETHEREUM_MAINNET_NETWORK,
} from "@/lib/wallet-inventory/adapters/alchemy-evm-fetcher";
import { createDefaultInventoryProviderRegistry } from "@/lib/wallet-inventory/wiring";

test("default production registry wires live Alchemy fetcher for EVM", async () => {
  const previousKey = env.ALCHEMY_API_KEY;
  env.ALCHEMY_API_KEY = undefined;

  try {
    const provider = createDefaultInventoryProviderRegistry().get("eip155");
    assert.ok(provider);

    await assert.rejects(
      () =>
        provider.fetchHoldings({
          chainNamespace: "eip155",
          ownerAddress: "0x1111111111111111111111111111111111111111",
        }),
      /ALCHEMY_API_KEY is required/
    );
  } finally {
    env.ALCHEMY_API_KEY = previousKey;
  }
});

test("one-page ERC-721 Alchemy response maps to EVM raw holding shape", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ownedNfts: [
            {
              contract: {
                address: "0xabcDEF0000000000000000000000000000000000",
                tokenType: "ERC721",
              },
              id: { tokenId: "0x01" },
              tokenType: "ERC721",
              balance: "1",
              collection: { id: "collection-id", slug: "collection-slug" },
              acquiredAt: { blockTimestamp: "2024-01-01T00:00:00.000Z" },
            },
          ],
        })
      ),
  });

  const items = await fetcher("0x1111111111111111111111111111111111111111");
  assert.equal(items.length, 1);
  assert.equal(items[0].contractAddress, "0xabcDEF0000000000000000000000000000000000");
  assert.equal(items[0].tokenId, "0x01");
  assert.equal(items[0].tokenType, "ERC721");
  assert.equal(items[0].balance, "1");
  assert.equal(items[0].collection?.slug, "collection-slug");
});

test("ERC-1155 balances are preserved in raw holdings", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ownedNfts: [
            {
              contract: {
                address: "0x2222222222222222222222222222222222222222",
                tokenType: "ERC1155",
              },
              tokenId: "17",
              tokenType: "ERC1155",
              balance: "7",
            },
          ],
        })
      ),
  });

  const items = await fetcher("0x3333333333333333333333333333333333333333");
  assert.equal(items.length, 1);
  assert.equal(items[0].tokenType, "ERC1155");
  assert.equal(items[0].balance, "7");
});

test("multiple Alchemy pages are combined until pagination completes", async () => {
  const requestedUrls: string[] = [];
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (requestedUrls.length === 1) {
        return new Response(
          JSON.stringify({
            ownedNfts: [
              {
                contract: { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
                tokenId: "1",
                tokenType: "ERC721",
              },
            ],
            pageKey: "next-page",
          })
        );
      }
      return new Response(
        JSON.stringify({
          ownedNfts: [
            {
              contract: { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
              tokenId: "2",
              tokenType: "ERC1155",
              balance: "3",
            },
          ],
        })
      );
    },
  });

  const items = await fetcher("0x4444444444444444444444444444444444444444");
  assert.equal(items.length, 2);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /getNFTsForOwner\?/);
  assert.match(requestedUrls[0], new RegExp(ALCHEMY_ETHEREUM_MAINNET_NETWORK));
  assert.match(requestedUrls[1], /pageKey=next-page/);
});

test("successful empty Alchemy response returns empty holdings array", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ownedNfts: [],
        })
      ),
  });

  const items = await fetcher("0x5555555555555555555555555555555555555555");
  assert.deepEqual(items, []);
});

test("HTTP failure throws instead of returning empty array", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "upstream failure" }), {
        status: 502,
      }),
  });

  await assert.rejects(
    () => fetcher("0x6666666666666666666666666666666666666666"),
    /HTTP 502/
  );
});

test("Alchemy error payload with HTTP 200 throws", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: { code: -32000, message: "rate limited" },
        })
      ),
  });

  await assert.rejects(
    () => fetcher("0x7777777777777777777777777777777777777777"),
    /Alchemy getNFTsForOwner error/
  );
});

test("malformed Alchemy payload throws", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          pageKey: "next",
        })
      ),
  });

  await assert.rejects(
    () => fetcher("0x1234567890123456789012345678901234567890"),
    /missing ownedNfts array/
  );
});

test("pagination failure throws when pageKey repeats", async () => {
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    apiKey: "alchemy-test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          ownedNfts: [],
          pageKey: "repeat-me",
        })
      ),
  });

  await assert.rejects(
    () => fetcher("0x9999999999999999999999999999999999999999"),
    /pagination failure/
  );
});

test("missing API key throws", async () => {
  const previousKey = env.ALCHEMY_API_KEY;
  env.ALCHEMY_API_KEY = undefined;
  const fetcher = createAlchemyEvmRawHoldingsFetcher({
    fetchImpl: async () => new Response(JSON.stringify({ ownedNfts: [] })),
  });

  try {
    await assert.rejects(
      () => fetcher("0x8888888888888888888888888888888888888888"),
      /ALCHEMY_API_KEY is required/
    );
  } finally {
    env.ALCHEMY_API_KEY = previousKey;
  }
});
