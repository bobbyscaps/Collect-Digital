"use client";

import { AssetCard } from "@/components/profile/collection-assets/asset-card";
import type { AssetCardSize } from "@/components/profile/collection-assets/types";
import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

export function GridView({
  assets,
  cardSize,
}: {
  assets: readonly CollectorIdentityAssetData[];
  cardSize: AssetCardSize;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      data-testid="collection-assets-grid-view"
    >
      {assets.map((asset) => (
        <AssetCard key={asset.assetId} asset={asset} cardSize={cardSize} />
      ))}
    </div>
  );
}
