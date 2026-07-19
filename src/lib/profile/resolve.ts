import { getActiveCollectorWeights } from "@/lib/scoring/collector-weights";
import {
  computeCollectorSubScores,
  computeWalletCollectorRating,
} from "@/lib/scoring/wallet-collector";
import { deriveWalletMetrics, isEthAddress } from "@/lib/scoring/wallet-metrics";
import {
  getProfile,
  getSyntheticWalletMetrics,
  IDENTITY_LABELS,
  type Profile,
} from "@/lib/profile/data";
import type { WalletBehaviorMetrics } from "@/lib/types";

/**
 * Server-side profile resolver. Derives the collector rating using the active
 * (tunable) formula weights. For wallet-address profiles the inputs come from
 * real on-chain history; otherwise they are synthetic per-username metrics.
 */
export async function getProfileWithRating(username: string): Promise<Profile> {
  const base = getProfile(username);
  const weights = await getActiveCollectorWeights();

  const address = isEthAddress(username) ? username.toLowerCase() : null;

  let metrics: WalletBehaviorMetrics | null = null;
  let source: Profile["ratingSource"] = "synthetic";

  if (address) {
    const onchain = await deriveWalletMetrics(address);
    if (onchain) {
      metrics = onchain;
      source = "onchain";
    }
  }
  if (!metrics) {
    metrics = getSyntheticWalletMetrics(username);
    source = "synthetic";
  }

  const rating = computeWalletCollectorRating(metrics, weights);
  const subScores = computeCollectorSubScores(metrics);

  const addressOverrides = address
    ? {
        displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
        initials: address.slice(2, 4).toUpperCase(),
        walletVerified: true,
        publicNftCount: metrics.collectionsStillHeld,
        portfolio: {
          ...base.portfolio,
          floorValueEth: metrics.unrealizedValueEth,
          nftCount: metrics.boughtCount + metrics.mintCount,
          collectionCount: metrics.collectionsStillHeld,
        },
      }
    : {};

  return {
    ...base,
    ...addressOverrides,
    collectorScore: rating.collectorScore,
    flipperScore: rating.flipperScore,
    collectorStyle: IDENTITY_LABELS[rating.walletIdentity],
    mainBadge: rating.mainBadge.label,
    secondaryBadges: rating.secondaryBadges.map((badge) => badge.label).slice(0, 3),
    rating,
    subScores,
    ratingSource: source,
  };
}
