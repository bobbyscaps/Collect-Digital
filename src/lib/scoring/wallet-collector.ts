import type {
  WalletBadge,
  WalletBehaviorMetrics,
  WalletCollectorRating,
  WalletIdentityType,
} from "@/lib/types";

const BADGE_LIBRARY: Record<string, WalletBadge> = {
  diamond_hands: {
    key: "diamond_hands",
    label: "Diamond Hands",
    description: "Holds conviction positions through volatility.",
  },
  true_collector: {
    key: "true_collector",
    label: "True Collector",
    description: "Builds a high-quality portfolio with patience.",
  },
  culture_curator: {
    key: "culture_curator",
    label: "Culture Curator",
    description: "Selects culturally relevant projects.",
  },
  early_mint_hunter: {
    key: "early_mint_hunter",
    label: "Early Mint Hunter",
    description: "Mints early and identifies momentum quickly.",
  },
  blue_chip_holder: {
    key: "blue_chip_holder",
    label: "Blue Chip Holder",
    description: "Owns top-scored collections consistently.",
  },
  community_loyalist: {
    key: "community_loyalist",
    label: "Community Loyalist",
    description: "Shows strong long-term holder participation.",
  },
  smart_flipper: {
    key: "smart_flipper",
    label: "Smart Flipper",
    description: "Efficient turnover with disciplined timing.",
  },
  elite_flipper: {
    key: "elite_flipper",
    label: "Elite Flipper",
    description: "High-volume, profitable, and well-timed exits.",
  },
  paper_hands: {
    key: "paper_hands",
    label: "Paper Hands",
    description: "Frequently exits too early.",
  },
  sleeping_wallet: {
    key: "sleeping_wallet",
    label: "Sleeping Wallet",
    description: "Low recent activity with minimal turnover.",
  },
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function selectIdentity(
  collectorScore: number,
  flipperScore: number,
  metrics: WalletBehaviorMetrics
): WalletIdentityType {
  if (metrics.saleFrequencyPerMonth < 0.4) {
    return "dormant_wallet";
  }
  if (collectorScore >= 85 && metrics.heldOver180Pct > 60) {
    return "diamond_collector";
  }
  if (collectorScore >= 75 && metrics.collectionQualityScore > 0.75) {
    return "true_collector";
  }
  if (collectorScore >= 70 && metrics.diversityScore < 0.55) {
    return "curator";
  }
  if (metrics.communityParticipationScore > 0.75) {
    return "community_holder";
  }
  if (metrics.mintCount > 15 && metrics.prePumpBuyRate > 0.5) {
    return "early_minter";
  }
  if (metrics.unrealizedValueEth > 250) {
    return "whale_collector";
  }
  if (flipperScore >= 80) {
    return "elite_flipper";
  }
  if (flipperScore >= 60) {
    return "flipper";
  }
  if (collectorScore < 40 && metrics.avgHoldDays < 20) {
    return "paper_hands";
  }
  return "true_collector";
}

function identityToMainBadge(identity: WalletIdentityType): WalletBadge {
  switch (identity) {
    case "diamond_collector":
      return BADGE_LIBRARY.diamond_hands;
    case "true_collector":
      return BADGE_LIBRARY.true_collector;
    case "curator":
      return BADGE_LIBRARY.culture_curator;
    case "community_holder":
      return BADGE_LIBRARY.community_loyalist;
    case "early_minter":
      return BADGE_LIBRARY.early_mint_hunter;
    case "whale_collector":
      return BADGE_LIBRARY.blue_chip_holder;
    case "flipper":
      return BADGE_LIBRARY.smart_flipper;
    case "elite_flipper":
      return BADGE_LIBRARY.elite_flipper;
    case "paper_hands":
      return BADGE_LIBRARY.paper_hands;
    case "dormant_wallet":
      return BADGE_LIBRARY.sleeping_wallet;
  }
}

export function computeWalletCollectorRating(
  metrics: WalletBehaviorMetrics
): WalletCollectorRating {
  const holdingBehaviorScore = clamp(
    metrics.heldOver90Pct * 0.35 +
      metrics.heldOver180Pct * 0.35 +
      (metrics.avgHoldDays / 365) * 30
  );
  const collectionQualityScore = clamp(metrics.collectionQualityScore * 100);
  const profitabilityTimingScore = clamp(
    (metrics.realizedPnlEth ?? 0) * 1.2 +
      metrics.prePumpBuyRate * 40 +
      metrics.sellIntoPumpRate * 25
  );
  const activityLevelScore = clamp(
    (metrics.boughtCount + metrics.soldCount) / 3 + metrics.saleFrequencyPerMonth * 12
  );
  const communityParticipationScore = clamp(
    metrics.communityParticipationScore * 100
  );
  const walletLongevityScore = clamp((metrics.walletAgeDays / 3650) * 100);

  const collectorScore = clamp(
    holdingBehaviorScore * 0.25 +
      collectionQualityScore * 0.2 +
      profitabilityTimingScore * 0.2 +
      activityLevelScore * 0.15 +
      communityParticipationScore * 0.1 +
      walletLongevityScore * 0.1
  );

  const flipperScore = clamp(
    (metrics.saleFrequencyPerMonth * 18 +
      metrics.sellIntoPumpRate * 45 +
      metrics.prePumpBuyRate * 20 +
      ((metrics.realizedPnlEth ?? 0) / 20) * 30) *
      (metrics.avgHoldDays < 60 ? 1.1 : 0.82)
  );

  const walletIdentity = selectIdentity(collectorScore, flipperScore, metrics);
  const mainBadge = identityToMainBadge(walletIdentity);

  const secondaryBadges = Object.values(BADGE_LIBRARY).filter(
    (badge) => badge.key !== mainBadge.key
  );

  const strengths = [
    metrics.heldOver180Pct > 50 ? "Strong long-term holding discipline" : null,
    metrics.prePumpBuyRate > 0.5 ? "Buys ahead of momentum" : null,
    metrics.communityParticipationScore > 0.7
      ? "High community participation"
      : null,
    metrics.collectionQualityScore > 0.75
      ? "Portfolio quality skews toward top projects"
      : null,
  ].filter(Boolean) as string[];

  const weaknesses = [
    metrics.ecosystemConcentrationPct > 0.75
      ? "Concentration risk in one ecosystem"
      : null,
    metrics.sellIntoPumpRate < 0.25 ? "Misses some profitable exits" : null,
    metrics.avgHoldDays < 40 ? "May exit too quickly on average" : null,
  ].filter(Boolean) as string[];

  return {
    collectorScore: Math.round(collectorScore),
    flipperScore: Math.round(flipperScore),
    walletIdentity,
    mainBadge,
    secondaryBadges: secondaryBadges.slice(0, 4),
    strengths,
    weaknesses,
    bestCollectionCalls: [
      "Bought Azuki before +23% move",
      "Held Pudgy Penguins through macro drawdown",
    ],
    worstExits: ["Exited Doodles two weeks before major floor run"],
    longestHeldNfts: ["Azuki #4421 (620 days)", "Pudgy Penguin #9134 (511 days)"],
    mostProfitableFlips: ["Minted Milady Maker and sold for +4.2 ETH"],
    trimSuggestions: ["Doodles: listing % rising faster than demand"],
    loyalCollections: ["Azuki", "Pudgy Penguins"],
  };
}
