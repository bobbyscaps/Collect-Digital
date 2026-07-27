import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

export type AssetCardSize = "small" | "medium" | "large";
export type AssetSortOption =
  | "recently_received"
  | "oldest_received"
  | "name_asc"
  | "name_desc"
  | "highest_listed_price"
  | "lowest_listed_price"
  | "highest_offer"
  | "lowest_offer"
  | "most_rare"
  | "least_rare"
  | "collection_name_asc"
  | "collection_name_desc"
  | "highest_collection_floor"
  | "lowest_collection_floor"
  | "highest_trait_floor"
  | "lowest_trait_floor";

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
