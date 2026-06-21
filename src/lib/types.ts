export type DataConfidenceLevel =
  | "auto_generated"
  | "community_funded"
  | "claimed"
  | "verified"
  | "full_evaluation";

export type AlertType =
  | "floor_up"
  | "floor_down"
  | "top_offer_increase"
  | "top_offer_near_floor"
  | "volume_spike"
  | "score_change"
  | "listing_percentage_rising"
  | "whale_selling"
  | "owned_top_mover"
  | "sell_opportunity";

export type WalletIdentityType =
  | "diamond_collector"
  | "true_collector"
  | "curator"
  | "community_holder"
  | "early_minter"
  | "whale_collector"
  | "flipper"
  | "elite_flipper"
  | "paper_hands"
  | "dormant_wallet";

export type ScoreCategoryKey =
  | "market_health"
  | "liquidity"
  | "community_strength"
  | "builder_team"
  | "product_utility"
  | "culture_art_brand"
  | "holder_value_rewards"
  | "skin_in_the_game";

export interface CollectionMarketSnapshot {
  collectionSlug: string;
  floorPriceEth: number;
  floorChange24hPct: number;
  volume24hEth: number;
  volume7dEth: number;
  sales24h: number;
  holderCount: number;
  uniqueOwnerPct: number;
  listedCount: number;
  listedPct: number;
  topOfferEth: number;
  bidDepthEth: number;
  whaleConcentrationPct?: number | null;
  capturedAt: string;
}

export interface CollectionProfile {
  slug: string;
  name: string;
  imageUrl: string;
  baseScore?: number;
  bannerUrl?: string | null;
  description?: string | null;
  contractAddress?: string | null;
  chain: string;
  openseaUrl: string;
  officialWebsite?: string | null;
  xUrl?: string | null;
  discordUrl?: string | null;
  telegramUrl?: string | null;
  foundedAt?: string | null;
  founderNames?: string[];
  verified: boolean;
  claimed: boolean;
  hasToken: boolean;
  hasRewardPlatform: boolean;
  hasIrlEvents: boolean;
  hasBusinessRevenue: boolean;
  hasDevFounder: boolean;
  dataConfidenceLevel: DataConfidenceLevel;
}

export interface ScoreFactorValue {
  key: string;
  label: string;
  rawValue: number | boolean;
  normalizedValue: number;
  contribution: number;
  rationale: string;
}

export interface CategoryScoreResult {
  category: ScoreCategoryKey;
  label: string;
  maxPoints: number;
  score: number;
  factors: ScoreFactorValue[];
}

export interface ExplainabilityItem {
  factorKey: string;
  label: string;
  delta: number;
  reason: string;
}

export interface CollectionScoreResult {
  modelId: string;
  versionId: string;
  overallScore: number;
  confidenceScore: number;
  categories: CategoryScoreResult[];
  explainability: ExplainabilityItem[];
  computedAt: string;
}

export interface CollectionEvaluation {
  profile: CollectionProfile;
  marketSnapshot: CollectionMarketSnapshot;
  score: CollectionScoreResult;
}

export interface ProjectUpgradeCampaign {
  id: string;
  collectionSlug: string;
  targetUsd: number;
  raisedUsd: number;
  contributorCount: number;
  status: "active" | "funded" | "closed";
  perks: string[];
}

export interface WalletCollectionPosition {
  collectionSlug: string;
  collectionName: string;
  quantity: number;
  floorValueEth: number;
  bestOfferValueEth: number;
  avgCostBasisEth?: number | null;
  unrealizedPnLEth?: number | null;
}

export interface WalletPortfolioSummary {
  walletAddress: string;
  optimisticValueEth: number;
  conservativeValueEth: number;
  floorToOfferGapEth: number;
  topMovers: string[];
  risingFloors: string[];
  decliningFloors: string[];
  strongOffers: string[];
  potentialSellSignals: string[];
  positions: WalletCollectionPosition[];
}

export interface WalletBehaviorMetrics {
  walletAddress: string;
  walletAgeDays: number;
  avgHoldDays: number;
  boughtCount: number;
  soldCount: number;
  mintCount: number;
  saleFrequencyPerMonth: number;
  realizedPnlEth?: number | null;
  unrealizedValueEth: number;
  heldOver30Pct: number;
  heldOver90Pct: number;
  heldOver180Pct: number;
  heldOver365Pct: number;
  blueChipCount: number;
  sellIntoPumpRate: number;
  prePumpBuyRate: number;
  tradingVolumeEth: number;
  diversityScore: number;
  ecosystemConcentrationPct: number;
  collectionsFullyExited: number;
  collectionsStillHeld: number;
  communityParticipationScore: number;
  collectionQualityScore: number;
}

export interface WalletBadge {
  key: string;
  label: string;
  description: string;
}

export interface WalletCollectorRating {
  collectorScore: number;
  flipperScore: number;
  walletIdentity: WalletIdentityType;
  mainBadge: WalletBadge;
  secondaryBadges: WalletBadge[];
  strengths: string[];
  weaknesses: string[];
  bestCollectionCalls: string[];
  worstExits: string[];
  longestHeldNfts: string[];
  mostProfitableFlips: string[];
  trimSuggestions: string[];
  loyalCollections: string[];
}

export interface ScoringFactorRule {
  key: string;
  label: string;
  category: ScoreCategoryKey;
  enabled: boolean;
  weight: number;
  sourceMetric: string;
  normalization:
    | "min_max"
    | "boolean"
    | "inverse_min_max"
    | "z_score_cap"
    | "sigmoid";
  minValue?: number;
  maxValue?: number;
  cap?: number;
}

export interface ScoringModelVersion {
  id: string;
  modelId: string;
  modelName: string;
  versionName: string;
  isActive: boolean;
  description?: string | null;
  categoryWeights: Record<ScoreCategoryKey, number>;
  factorRules: ScoringFactorRule[];
  createdAt: string;
}

export interface ScoreSimulationResult {
  baseline: CollectionScoreResult;
  simulated: CollectionScoreResult;
  delta: number;
}
