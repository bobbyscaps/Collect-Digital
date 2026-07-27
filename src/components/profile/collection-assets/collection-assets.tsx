"use client";

import { LayoutGrid } from "lucide-react";

import { AssetViewRenderer } from "@/components/profile/collection-assets/asset-view-renderer";
import type {
  AssetCardSize,
  AssetViewMode,
  CollectionAssetsProps,
} from "@/components/profile/collection-assets/types";
import { EmptyState } from "@/components/profile/ui";
import { cn } from "@/lib/utils";

function resolveView(view: AssetViewMode | undefined): AssetViewMode {
  return view ?? "grid";
}

function resolveCardSize(cardSize: AssetCardSize | undefined): AssetCardSize {
  return cardSize ?? "medium";
}

export function CollectionAssets({
  assets,
  view,
  cardSize,
  className,
}: CollectionAssetsProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No NFTs in synced wallets yet"
        description="Verify a wallet and sync collectibles to populate your Collection assets view."
      />
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <AssetViewRenderer
        assets={assets}
        view={resolveView(view)}
        cardSize={resolveCardSize(cardSize)}
      />
    </section>
  );
}
