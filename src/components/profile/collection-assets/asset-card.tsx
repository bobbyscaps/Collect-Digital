"use client";

import React from "react";
import { ExternalLink, ImageOff } from "lucide-react";

import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";
import type { AssetCardSize } from "@/components/profile/collection-assets/types";
import { cn } from "@/lib/utils";

function formatEth(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value === 0) return "0 ETH";
  if (value < 0.01) return "<0.01 ETH";
  return `${value.toFixed(value >= 1 ? 2 : 3)} ETH`;
}

function cardSizeClass(size: AssetCardSize) {
  if (size === "small") return "p-3";
  if (size === "large") return "p-5";
  return "p-4";
}

function imageSizeClass(size: AssetCardSize) {
  if (size === "small") return "aspect-[4/3]";
  if (size === "large") return "aspect-square";
  return "aspect-[5/4]";
}

function traitLabel(asset: CollectorIdentityAssetData) {
  if (!asset.topTraitFloor) return "Unavailable";
  const pieces = [asset.topTraitFloor.traitType, asset.topTraitFloor.traitValue].filter(
    Boolean
  );
  return pieces.length > 0 ? pieces.join(": ") : "Available";
}

function offerLabel(scope: CollectorIdentityAssetData["highestOfferScope"]) {
  if (scope === "token") return "Token";
  if (scope === "collection") return "Collection";
  if (scope === "trait") return "Trait";
  if (scope === "unknown") return "Market";
  return null;
}

export function AssetCard({
  asset,
  cardSize,
}: {
  asset: CollectorIdentityAssetData;
  cardSize: AssetCardSize;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20",
        cardSizeClass(cardSize)
      )}
      data-testid="collection-asset-card"
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-white/10 bg-black/25",
          imageSizeClass(cardSize)
        )}
      >
        {asset.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.imageUrl}
            alt={asset.name ?? `Token #${asset.tokenId}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="truncate text-sm font-semibold">
            {asset.name ?? `NFT #${asset.tokenId}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Token #{asset.tokenId}
          </p>
          <p className="truncate text-xs text-muted-foreground/90">
            {asset.collectionName ?? "Unknown Collection"}
          </p>
        </div>

        <dl className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Collection Floor</dt>
            <dd className="text-right font-medium">
              {formatEth(asset.collectionFloorPriceEth)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Listed Price</dt>
            <dd className="text-right font-medium">
              {formatEth(asset.listedPriceEth)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Top Trait Floor</dt>
            <dd className="max-w-[65%] truncate text-right font-medium">
              {traitLabel(asset)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Highest Offer</dt>
            <dd className="text-right font-medium">
              {asset.highestOfferEth != null
                ? `${formatEth(asset.highestOfferEth)}${
                    offerLabel(asset.highestOfferScope)
                      ? ` (${offerLabel(asset.highestOfferScope)})`
                      : ""
                  }`
                : "Unavailable"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Trait Floor Value</dt>
            <dd className="text-right font-medium">
              {formatEth(asset.topTraitFloor?.floorPriceEth ?? null)}
            </dd>
          </div>
        </dl>

        <a
          href={asset.openseaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-300 transition-colors hover:text-indigo-200"
        >
          View on OpenSea
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}
