import type {
  CategoryScoreResult,
  CollectionEvaluation,
  CollectionScoreResult,
  ExplainabilityItem,
  ScoreCategoryKey,
  ScoringFactorRule,
  ScoringModelVersion,
} from "@/lib/types";

const SCORE_CATEGORY_LABELS: Record<ScoreCategoryKey, string> = {
  market_health: "Market Health",
  liquidity: "Liquidity",
  community_strength: "Community Strength",
  builder_team: "Founder / Team Credibility",
  product_utility: "Builder / Product Score",
  culture_art_brand: "Art / Brand / Culture Score",
  holder_value_rewards: "Reward / Holder Value Score",
  skin_in_the_game: "Skin in the Game Score",
};

interface NormalizationInput {
  value: number | boolean | null | undefined;
  rule: ScoringFactorRule;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalize({ value, rule }: NormalizationInput): number {
  if (!rule.enabled) {
    return 0;
  }

  if (rule.normalization === "boolean") {
    return value ? 1 : 0;
  }

  const numericValue = typeof value === "number" ? value : 0;
  const min = rule.minValue ?? 0;
  const max = rule.maxValue ?? 1;
  const range = Math.max(max - min, 1e-9);

  switch (rule.normalization) {
    case "min_max":
      return clamp((numericValue - min) / range);
    case "inverse_min_max":
      return clamp(1 - (numericValue - min) / range);
    case "z_score_cap": {
      const cap = rule.cap ?? 2;
      const centered = (numericValue - min) / (max || 1);
      return clamp((centered + cap) / (2 * cap));
    }
    case "sigmoid": {
      const midpoint = (max + min) / 2;
      const steepness = 12 / range;
      return clamp(1 / (1 + Math.exp(-steepness * (numericValue - midpoint))));
    }
    default:
      return 0;
  }
}

function collectRawMetric(
  evaluation: CollectionEvaluation,
  metricPath: string
): number | boolean | undefined | null {
  const marketData = evaluation.marketSnapshot as unknown as Record<string, unknown>;
  const profileData = evaluation.profile as unknown as Record<string, unknown>;
  const derivedData: Record<string, number> = {
    yearsActive: evaluation.profile.foundedAt
      ? (Date.now() - new Date(evaluation.profile.foundedAt).getTime()) /
        (1000 * 60 * 60 * 24 * 365.25)
      : 0,
  };

  if (metricPath in marketData) {
    return marketData[metricPath] as number | boolean;
  }
  if (metricPath in profileData) {
    return profileData[metricPath] as number | boolean;
  }
  if (metricPath in derivedData) {
    return derivedData[metricPath];
  }

  return undefined;
}

function formatExplainabilityDelta(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeCollectionScore(
  evaluation: CollectionEvaluation,
  modelVersion: ScoringModelVersion
): CollectionScoreResult {
  const categories: CategoryScoreResult[] = [];
  const explainability: ExplainabilityItem[] = [];

  for (const [category, maxPoints] of Object.entries(
    modelVersion.categoryWeights
  ) as [ScoreCategoryKey, number][]) {
    const rules = modelVersion.factorRules.filter(
      (rule) => rule.category === category && rule.enabled
    );
    const totalWeight = Math.max(
      rules.reduce((acc, rule) => acc + rule.weight, 0),
      1e-9
    );

    const factors = rules.map((rule) => {
      const rawValue = collectRawMetric(evaluation, rule.sourceMetric);
      const normalizedValue = normalize({ value: rawValue, rule });
      const contribution = (normalizedValue * rule.weight * maxPoints) / totalWeight;
      explainability.push({
        factorKey: rule.key,
        label: rule.label,
        delta: formatExplainabilityDelta(contribution),
        reason: `${rule.label} normalized to ${(normalizedValue * 100).toFixed(
          0
        )}%`,
      });
      return {
        key: rule.key,
        label: rule.label,
        rawValue: (rawValue as number | boolean) ?? 0,
        normalizedValue,
        contribution,
        rationale: `Metric '${rule.sourceMetric}' with '${rule.normalization}' normalization`,
      };
    });

    const score = factors.reduce((acc, factor) => acc + factor.contribution, 0);

    categories.push({
      category,
      label: SCORE_CATEGORY_LABELS[category],
      maxPoints,
      score,
      factors,
    });
  }

  const overallScore = categories.reduce((acc, c) => acc + c.score, 0);
  const confidenceSignals = [
    evaluation.profile.discordUrl,
    evaluation.profile.xUrl,
    evaluation.profile.founderNames?.length,
    evaluation.marketSnapshot.whaleConcentrationPct,
    evaluation.profile.officialWebsite,
  ].filter(Boolean).length;
  const confidenceScore = Math.round((confidenceSignals / 5) * 100);

  return {
    modelId: modelVersion.modelId,
    versionId: modelVersion.id,
    overallScore: Math.round(overallScore),
    confidenceScore,
    categories: categories.map((category) => ({
      ...category,
      score: Math.round(category.score * 10) / 10,
      factors: category.factors.map((factor) => ({
        ...factor,
        contribution: Math.round(factor.contribution * 100) / 100,
      })),
    })),
    explainability: explainability
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 8),
    computedAt: new Date().toISOString(),
  };
}

export function computeScoreSimulation(
  evaluation: CollectionEvaluation,
  baselineVersion: ScoringModelVersion,
  candidateVersion: ScoringModelVersion
) {
  const baseline = computeCollectionScore(evaluation, baselineVersion);
  const simulated = computeCollectionScore(evaluation, candidateVersion);

  return {
    baseline,
    simulated,
    delta: Math.round((simulated.overallScore - baseline.overallScore) * 100) / 100,
  };
}
