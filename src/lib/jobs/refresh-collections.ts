import { getTrendingCollections } from "@/lib/opensea/service";
import { PROVIDER_REFRESH_INTERVALS } from "@/lib/providers/refresh-config";
import { computeCollectionScore } from "@/lib/scoring/engine";
import { getActiveScoringModelVersion } from "@/lib/scoring/repository";

export async function refreshCollectionSnapshotsJob() {
  const modelVersion = await getActiveScoringModelVersion();
  const collections = await getTrendingCollections();

  return collections.map((collection) => ({
    slug: collection.profile.slug,
    score: computeCollectionScore(collection, modelVersion),
    refreshIntervalMs: PROVIDER_REFRESH_INTERVALS.marketDataMs,
    refreshedAt: new Date().toISOString(),
  }));
}
