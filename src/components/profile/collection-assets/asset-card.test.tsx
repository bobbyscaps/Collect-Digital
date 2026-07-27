import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AssetCard } from "@/components/profile/collection-assets/asset-card";
import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

function asset(overrides: Partial<CollectorIdentityAssetData> = {}): CollectorIdentityAssetData {
  return {
    assetId: "eip155:0xabc:1",
    chainNamespace: "eip155",
    contractAddress: "0xabc",
    tokenId: "1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    listedPriceEth: 1.2,
    highestOfferEth: 1.1,
    highestOfferScope: "token",
    rarityRank: 50,
    name: "Asset One",
    imageUrl: null,
    collectionName: "Collection A",
    collectionFloorPriceEth: 2,
    topTraitFloor: {
      traitType: "Background",
      traitValue: "Blue",
      floorPriceEth: 0.9,
    },
    openseaUrl: "https://opensea.io/assets/ethereum/0xabc/1",
    ...overrides,
  };
}

test("AssetCard renders NFT image when image URL exists", () => {
  const html = renderToStaticMarkup(
    React.createElement(AssetCard, {
      asset: asset({ imageUrl: "https://cdn.example.com/image.png" }),
      cardSize: "medium",
    })
  );

  assert.match(html, /src="https:\/\/cdn\.example\.com\/image\.png"/);
  assert.match(html, /Highest Offer/);
  assert.match(html, /Listed Price/);
});

test("AssetCard shows graceful fallback when image URL is missing", () => {
  const html = renderToStaticMarkup(
    React.createElement(AssetCard, {
      asset: asset({ imageUrl: null }),
      cardSize: "medium",
    })
  );

  assert.equal(html.includes("src="), false);
  assert.match(html, /lucide-image-off/);
});
