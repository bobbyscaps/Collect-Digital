/**
 * Future permanent achievement metadata (PR8 architecture only).
 *
 * Achievements are earned once and remain part of a collector's history even
 * when dynamic status later changes. Do not persist or award achievements in
 * this PR — the Collector Identity API reserves an Achievements section that
 * returns Coming Soon until a later PR implements them.
 */

/** Permanent achievements always carry `permanent: true`. */
export interface CollectorAchievement {
  achievementId: string;
  badgeId: string;
  badgeName: string;
  icon: string;
  description: string;
  earnedAt: string;
  awardedBy: string;
  rulesVersion: string;
  /** Optional rarity label for future badge presentation. */
  rarity?: string;
  displayOrder: number;
  /** Achievements are permanent historical facts. */
  permanent: true;
}

/**
 * Dynamic status modules (current state that may change over time).
 * Contrasts with permanent achievements — never conflate the two.
 */
export type CollectorDynamicStatusModule =
  | "wallet_verification"
  | "inventory_freshness"
  | "collector_score"
  | "collection_scores"
  | "portfolio_metrics"
  | "communities"
  | "followers"
  | "following";
