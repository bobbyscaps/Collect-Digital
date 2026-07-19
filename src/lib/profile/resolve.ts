import {
  computeCollectorSubScores,
  computeWalletCollectorRating,
} from "@/lib/scoring/wallet-collector";
import { deriveWalletMetrics, isEthAddress } from "@/lib/scoring/wallet-metrics";
import { getProfile, IDENTITY_LABELS, type Profile } from "@/lib/profile/data";

/**
 * Server-side profile resolver. For profiles identified by a wallet address it
 * derives the collector rating from real on-chain history; otherwise it returns
 * the synthetic profile. Non-rating fields (bio copy, favorites) remain
 * placeholder content for now.
 */
export async function getProfileWithRating(username: string): Promise<Profile> {
  const base = getProfile(username);

  if (!isEthAddress(username)) {
    return base;
  }

  const metrics = await deriveWalletMetrics(username);
  if (!metrics) {
    return base;
  }

  const rating = computeWalletCollectorRating(metrics);
  const subScores = computeCollectorSubScores(metrics);
  const address = username.toLowerCase();

  return {
    ...base,
    displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
    initials: address.slice(2, 4).toUpperCase(),
    collectorScore: rating.collectorScore,
    flipperScore: rating.flipperScore,
    collectorStyle: IDENTITY_LABELS[rating.walletIdentity],
    mainBadge: rating.mainBadge.label,
    secondaryBadges: rating.secondaryBadges.map((badge) => badge.label).slice(0, 3),
    walletVerified: true,
    publicNftCount: metrics.collectionsStillHeld,
    portfolio: {
      ...base.portfolio,
      floorValueEth: metrics.unrealizedValueEth,
      nftCount: metrics.boughtCount + metrics.mintCount,
      collectionCount: metrics.collectionsStillHeld,
    },
    rating,
    subScores,
    ratingSource: "onchain",
  };
}
