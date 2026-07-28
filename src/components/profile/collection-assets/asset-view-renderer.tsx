"use client";

import { GridView } from "@/components/profile/collection-assets/grid-view";
import type {
  AssetCardSize,
  AssetViewMode,
} from "@/components/profile/collection-assets/types";
import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";

type RendererProps = {
  assets: readonly CollectorIdentityAssetData[];
  cardSize: AssetCardSize;
};

type AssetViewRendererComponent = (props: RendererProps) => JSX.Element;

const VIEW_RENDERERS: Partial<Record<AssetViewMode, AssetViewRendererComponent>> =
  {
    grid: GridView,
  };

export function AssetViewRenderer({
  assets,
  view,
  cardSize,
}: {
  assets: readonly CollectorIdentityAssetData[];
  view: AssetViewMode;
  cardSize: AssetCardSize;
}) {
  const Renderer = VIEW_RENDERERS[view] ?? GridView;
  return <Renderer assets={assets} cardSize={cardSize} />;
}
