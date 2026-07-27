"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";

import { AssetViewRenderer } from "@/components/profile/collection-assets/asset-view-renderer";
import {
  ASSET_SORT_OPTIONS,
  DEFAULT_ASSET_SORT,
  sortAssets,
} from "@/components/profile/collection-assets/sorting";
import type {
  AssetCardSize,
  AssetSortOption,
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
  const [sortBy, setSortBy] = useState<AssetSortOption>(DEFAULT_ASSET_SORT);

  const sortedAssets = useMemo(
    () => sortAssets(assets, sortBy),
    [assets, sortBy]
  );

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
      <div className="flex items-center justify-end">
        <label
          htmlFor="collection-assets-sort"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="uppercase tracking-wider">Sort By</span>
          <select
            id="collection-assets-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as AssetSortOption)}
            className="rounded-md border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:border-white/25 focus:border-indigo-300"
          >
            {ASSET_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AssetViewRenderer
        assets={sortedAssets}
        view={resolveView(view)}
        cardSize={resolveCardSize(cardSize)}
      />
    </section>
  );
}
