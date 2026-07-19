import type { User } from "@privy-io/react-auth";

import { MOCK_WALLET_METRICS } from "@/lib/mock-data";
import {
  computeCollectorSubScores,
  computeWalletCollectorRating,
  type CollectorSubScores,
} from "@/lib/scoring/wallet-collector";
import type {
  WalletBehaviorMetrics,
  WalletCollectorRating,
  WalletIdentityType,
} from "@/lib/types";

export type SocialAccount = {
  platform: string;
  handle: string;
};

export type PointActivity = {
  id: string;
  label: string;
  points: number;
  when: string;
};

export type ProfilePrivacy = {
  /** When false, financial values are hidden from non-owners. */
  showFinancials: boolean;
  /** When false, the collection tab is private to non-owners. */
  showCollection: boolean;
};

export type ProfilePortfolio = {
  floorValueEth: number;
  bestOfferValueEth: number;
  nftCount: number;
  collectionCount: number;
  hiddenCount: number;
};

export type Profile = {
  username: string;
  displayName: string;
  initials: string;
  bioSummary: string;
  fullBio: string;
  collectorStory: string;
  memberSince: string;
  location?: string;
  website?: string;
  socials: SocialAccount[];
  favoriteCollections: string[];
  favoriteChains: string[];
  interests: string[];
  collectorStyle: string;
  mainBadge: string;
  secondaryBadges: string[];
  collectorScore: number;
  flipperScore: number;
  collectPoints: number;
  profileCompletion: number;
  recentPointActivity: PointActivity[];
  followers: number;
  following: number;
  communitiesCount: number;
  publicNftCount: number;
  walletVerified: boolean;
  privacy: ProfilePrivacy;
  portfolio: ProfilePortfolio;
  /** Full collector rating from the scoring engine (identity, badges, strengths…). */
  rating: WalletCollectorRating;
  /** The six normalized sub-scores that blend into the Collector Score. */
  subScores: CollectorSubScores;
  /** Whether the rating was derived from on-chain history or synthetic metrics. */
  ratingSource: "onchain" | "synthetic";
};

/** Compact, public-safe representation of a collector used in search results. */
export type CollectorPreview = {
  username: string;
  displayName: string;
  initials: string;
  bioSummary: string;
  mainBadge: string;
  collectorScore: number;
  followers: number;
  publicNftCount: number;
  communitiesCount: number;
  walletVerified: boolean;
};

export const IDENTITY_LABELS: Record<WalletIdentityType, string> = {
  diamond_collector: "Diamond Collector",
  true_collector: "True Collector",
  curator: "Curator",
  community_holder: "Community Holder",
  early_minter: "Early Minter",
  whale_collector: "Whale Collector",
  flipper: "Flipper",
  elite_flipper: "Elite Flipper",
  paper_hands: "Paper Hands",
  dormant_wallet: "Dormant Wallet",
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toDisplayName(slug: string): string {
  if (/^[0-9a-f]{6,}$/.test(slug)) return "Collector";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "CD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Derive a stable profile username slug from an authenticated Privy user. */
export function deriveUsername(user: User): string {
  if (user.twitter?.username) return slugify(user.twitter.username);
  if (user.google?.email) return slugify(user.google.email.split("@")[0]);
  if (user.apple?.email) return slugify(user.apple.email.split("@")[0]);
  if (user.email?.address) return slugify(user.email.address.split("@")[0]);
  if (user.wallet?.address) return user.wallet.address.toLowerCase();
  return "me";
}

export function formatEth(value: number): string {
  return `${value.toFixed(2)} ETH`;
}

/** The synthetic wallet metrics used for a username (no on-chain data). */
export function getSyntheticWalletMetrics(username: string): WalletBehaviorMetrics {
  return buildWalletMetrics(hash(slugify(username) || "collector"));
}

/** Deterministic pseudo-random value in [0,1) from a seed + salt. */
function pseudo(seed: number, salt: number): number {
  return ((seed ^ (salt * 2654435761)) >>> 0) / 0xffffffff;
}

/**
 * Build deterministic-but-varied wallet behavior metrics for a username so the
 * collector scoring engine produces a distinct, stable rating per collector.
 *
 * These are still synthetic inputs (there is no on-chain behavior analysis yet),
 * but the score, identity, badges, strengths and weaknesses are now produced by
 * the real scoring engine rather than a hash. Replace this with metrics derived
 * from wallet transaction history to make the score fully real.
 */
function buildWalletMetrics(seed: number): WalletBehaviorMetrics {
  const r = (salt: number, min: number, max: number) =>
    min + pseudo(seed, salt) * (max - min);
  const round2 = (value: number) => Math.round(value * 100) / 100;

  return {
    ...MOCK_WALLET_METRICS,
    walletAgeDays: Math.round(r(1, 120, 3200)),
    avgHoldDays: Math.round(r(2, 12, 420)),
    boughtCount: Math.round(r(3, 20, 300)),
    soldCount: Math.round(r(4, 5, 220)),
    mintCount: Math.round(r(5, 0, 60)),
    saleFrequencyPerMonth: round2(r(6, 0.1, 3)),
    realizedPnlEth: round2(r(7, -8, 40)),
    unrealizedValueEth: round2(r(8, 2, 400)),
    heldOver30Pct: Math.round(r(9, 30, 95)),
    heldOver90Pct: Math.round(r(10, 15, 90)),
    heldOver180Pct: Math.round(r(11, 5, 80)),
    heldOver365Pct: Math.round(r(12, 0, 60)),
    sellIntoPumpRate: round2(r(13, 0.05, 0.9)),
    prePumpBuyRate: round2(r(14, 0.05, 0.9)),
    diversityScore: round2(r(15, 0.2, 0.95)),
    ecosystemConcentrationPct: round2(r(16, 0.2, 0.95)),
    communityParticipationScore: round2(r(17, 0.1, 0.95)),
    collectionQualityScore: round2(r(18, 0.2, 0.95)),
  };
}

/**
 * Returns a deterministic mock profile for any username. In production this
 * would be replaced by a real data source, but the shape is stable so the UI
 * can be built against it today.
 */
export function getProfile(usernameInput: string): Profile {
  const username = slugify(usernameInput) || "collector";
  const seed = hash(username);
  const displayName = toDisplayName(username);
  const initials = toInitials(displayName);

  const metrics = buildWalletMetrics(seed);
  const rating = computeWalletCollectorRating(metrics);
  const subScores = computeCollectorSubScores(metrics);

  const collectPoints = 1200 + (seed % 8800);
  const profileCompletion = 55 + (seed % 45);

  return {
    username,
    displayName,
    initials,
    bioSummary:
      "Onchain collector, community builder, and long-term believer in digital culture.",
    fullBio:
      "Collecting since the early days of NFTs. I focus on culturally significant projects with strong communities and durable teams. I care about provenance, story, and the people behind each collection — not just the floor.",
    collectorStory:
      "Started with a single profile-picture mint and fell down the rabbit hole. These days I split my time between curating a focused personal gallery, supporting emerging artists, and helping newer collectors avoid the mistakes I made early on.",
    memberSince: "March 2021",
    location: seed % 2 === 0 ? "Brooklyn, NY" : undefined,
    website: "https://collect.digital",
    socials: [
      { platform: "X", handle: `@${username}` },
      { platform: "Farcaster", handle: `@${username}` },
    ],
    favoriteCollections: [
      "Bored Ape Yacht Club",
      "Pudgy Penguins",
      "Azuki",
      "Chromie Squiggle",
    ],
    favoriteChains: ["Ethereum", "Base", "Solana"],
    interests: ["PFPs", "Generative Art", "Onchain Gaming", "Music NFTs"],
    collectorStyle: IDENTITY_LABELS[rating.walletIdentity],
    mainBadge: rating.mainBadge.label,
    secondaryBadges: rating.secondaryBadges.map((badge) => badge.label).slice(0, 3),
    collectorScore: rating.collectorScore,
    flipperScore: rating.flipperScore,
    collectPoints,
    profileCompletion,
    recentPointActivity: [
      { id: "a1", label: "Completed profile bio", points: 50, when: "2d ago" },
      { id: "a2", label: "Contributed to a project wiki", points: 120, when: "5d ago" },
      { id: "a3", label: "Welcomed 3 new collectors", points: 30, when: "1w ago" },
      { id: "a4", label: "Connected X account", points: 25, when: "2w ago" },
    ],
    followers: 300 + (seed % 5200),
    following: 80 + (seed % 900),
    communitiesCount: 2 + (seed % 7),
    publicNftCount: 6 + (seed % 18),
    walletVerified: seed % 4 !== 0,
    privacy: {
      showFinancials: false,
      showCollection: true,
    },
    portfolio: {
      floorValueEth: 8 + (seed % 40) + 0.4,
      bestOfferValueEth: 6 + (seed % 32) + 0.2,
      nftCount: 40 + (seed % 260),
      collectionCount: 8 + (seed % 40),
      hiddenCount: seed % 8,
    },
    rating,
    subScores,
    ratingSource: "synthetic",
  };
}

export function toCollectorPreview(profile: Profile): CollectorPreview {
  return {
    username: profile.username,
    displayName: profile.displayName,
    initials: profile.initials,
    bioSummary: profile.bioSummary,
    mainBadge: profile.mainBadge,
    collectorScore: profile.collectorScore,
    followers: profile.followers,
    publicNftCount: profile.publicNftCount,
    communitiesCount: profile.communitiesCount,
    walletVerified: profile.walletVerified,
  };
}

const CURATED_COLLECTORS = [
  "satoshi",
  "punk6529",
  "vincent-van-dao",
  "luna-collector",
  "degen-dan",
  "art-whale",
  "pixel-priya",
  "onchain-omar",
];

/**
 * Collector directory search. There is no collector database yet, so this
 * returns curated sample collectors matching the query plus a generated
 * profile preview for the exact query, all backed by the shared profile model.
 */
export function searchCollectors(query: string, limit = 8): CollectorPreview[] {
  const slug = slugify(query);
  const normalized = query.trim().toLowerCase();

  let usernames: string[];
  if (!slug) {
    usernames = CURATED_COLLECTORS.slice(0, limit);
  } else {
    const matches = CURATED_COLLECTORS.filter(
      (name) =>
        name.includes(slug) || toDisplayName(name).toLowerCase().includes(normalized)
    );
    const ordered = matches.includes(slug) ? matches : [slug, ...matches];
    usernames = Array.from(new Set(ordered)).slice(0, limit);
  }

  return usernames.map((name) => toCollectorPreview(getProfile(name)));
}
