import type { User } from "@privy-io/react-auth";

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
  privacy: ProfilePrivacy;
  portfolio: ProfilePortfolio;
};

const MAIN_BADGES = [
  "Diamond Hands",
  "Blue-Chip Collector",
  "Community Builder",
  "Early Adopter",
  "Tastemaker",
];

const COLLECTOR_STYLES = [
  "Long-term holder",
  "Active flipper",
  "Art-first curator",
  "Community-first collector",
];

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
  if (user.wallet?.address) return user.wallet.address.slice(2, 10).toLowerCase();
  return "me";
}

export function formatEth(value: number): string {
  return `${value.toFixed(2)} ETH`;
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

  const collectorScore = 62 + (seed % 34);
  const flipperScore = 40 + ((seed >> 3) % 55);
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
    collectorStyle: COLLECTOR_STYLES[seed % COLLECTOR_STYLES.length],
    mainBadge: MAIN_BADGES[seed % MAIN_BADGES.length],
    secondaryBadges: ["Early Adopter", "Verified Wallet", "Community Contributor"],
    collectorScore,
    flipperScore,
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
  };
}
