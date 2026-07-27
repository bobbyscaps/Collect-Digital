import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

export type AssetCardSize = "small" | "medium" | "large";

/**
 * Additional views are intentionally declared now so future layout modes can be
 * registered without changing data contracts or business logic.
 */
export type AssetViewMode =
  | "grid"
  | "compact_grid"
  | "large_grid"
  | "gallery"
  | "list"
  | "table"
  | "masonry"
  | "collection_grouped"
  | "activity"
  | "marketplace";

export interface CollectionAssetsProps {
  assets: readonly CollectorIdentityAssetData[];
  view?: AssetViewMode;
  cardSize?: AssetCardSize;
  className?: string;
}
