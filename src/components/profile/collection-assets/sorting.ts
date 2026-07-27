import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";
import type { AssetSortOption } from "@/components/profile/collection-assets/types";

export const DEFAULT_ASSET_SORT: AssetSortOption = "recently_received";

export const ASSET_SORT_OPTIONS: ReadonlyArray<{
  value: AssetSortOption;
  label: string;
}> = Object.freeze([
  { value: "recently_received", label: "Recently Received" },
  { value: "oldest_received", label: "Oldest Received" },
  { value: "name_asc", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "highest_listed_price", label: "Highest Listed Price" },
  { value: "lowest_listed_price", label: "Lowest Listed Price" },
  { value: "highest_offer", label: "Highest Offer" },
  { value: "lowest_offer", label: "Lowest Offer" },
  { value: "most_rare", label: "Most Rare" },
  { value: "least_rare", label: "Least Rare" },
  { value: "collection_name_asc", label: "Collection Name (A-Z)" },
  { value: "collection_name_desc", label: "Collection Name (Z-A)" },
  { value: "highest_collection_floor", label: "Highest Collection Floor" },
  { value: "lowest_collection_floor", label: "Lowest Collection Floor" },
  { value: "highest_trait_floor", label: "Highest Trait Floor" },
  { value: "lowest_trait_floor", label: "Lowest Trait Floor" },
]);

function normalizeText(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  order: "asc" | "desc"
) {
  const leftMissing = left == null;
  const rightMissing = right == null;
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return order === "asc" ? left - right : right - left;
}

function compareText(
  left: string | null,
  right: string | null,
  order: "asc" | "desc"
) {
  const leftValue = normalizeText(left);
  const rightValue = normalizeText(right);
  const leftMissing = leftValue.length === 0;
  const rightMissing = rightValue.length === 0;
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return order === "asc"
    ? leftValue.localeCompare(rightValue)
    : rightValue.localeCompare(leftValue);
}

function compareBySortOption(
  left: CollectorIdentityAssetData,
  right: CollectorIdentityAssetData,
  option: AssetSortOption
) {
  switch (option) {
    case "recently_received":
      return compareNullableNumber(
        toTimestamp(left.receivedAt),
        toTimestamp(right.receivedAt),
        "desc"
      );
    case "oldest_received":
      return compareNullableNumber(
        toTimestamp(left.receivedAt),
        toTimestamp(right.receivedAt),
        "asc"
      );
    case "name_asc":
      return compareText(left.name, right.name, "asc");
    case "name_desc":
      return compareText(left.name, right.name, "desc");
    case "highest_listed_price":
      return compareNullableNumber(
        left.listedPriceEth,
        right.listedPriceEth,
        "desc"
      );
    case "lowest_listed_price":
      return compareNullableNumber(
        left.listedPriceEth,
        right.listedPriceEth,
        "asc"
      );
    case "highest_offer":
      return compareNullableNumber(
        left.highestOfferEth,
        right.highestOfferEth,
        "desc"
      );
    case "lowest_offer":
      return compareNullableNumber(
        left.highestOfferEth,
        right.highestOfferEth,
        "asc"
      );
    case "most_rare":
      return compareNullableNumber(left.rarityRank, right.rarityRank, "asc");
    case "least_rare":
      return compareNullableNumber(left.rarityRank, right.rarityRank, "desc");
    case "collection_name_asc":
      return compareText(left.collectionName, right.collectionName, "asc");
    case "collection_name_desc":
      return compareText(left.collectionName, right.collectionName, "desc");
    case "highest_collection_floor":
      return compareNullableNumber(
        left.collectionFloorPriceEth,
        right.collectionFloorPriceEth,
        "desc"
      );
    case "lowest_collection_floor":
      return compareNullableNumber(
        left.collectionFloorPriceEth,
        right.collectionFloorPriceEth,
        "asc"
      );
    case "highest_trait_floor":
      return compareNullableNumber(
        left.topTraitFloor?.floorPriceEth ?? null,
        right.topTraitFloor?.floorPriceEth ?? null,
        "desc"
      );
    case "lowest_trait_floor":
      return compareNullableNumber(
        left.topTraitFloor?.floorPriceEth ?? null,
        right.topTraitFloor?.floorPriceEth ?? null,
        "asc"
      );
    default:
      return 0;
  }
}

export function sortAssets(
  assets: readonly CollectorIdentityAssetData[],
  option: AssetSortOption
): CollectorIdentityAssetData[] {
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const primary = compareBySortOption(left.asset, right.asset, option);
      if (primary !== 0) return primary;
      return left.index - right.index;
    })
    .map((entry) => entry.asset);
}
