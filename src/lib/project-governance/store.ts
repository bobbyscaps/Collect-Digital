import type {
  CollectionProfile,
  CommunityContributionSubmission,
  FounderClaimUpdateSubmission,
  ProjectGovernanceSnapshot,
  ProjectTimelineEvent,
} from "@/lib/types";

const founderUpdatesBySlug = new Map<string, FounderClaimUpdateSubmission[]>();
const communityContributionsBySlug = new Map<string, CommunityContributionSubmission[]>();
const timelineBySlug = new Map<string, ProjectTimelineEvent[]>();

export const FOUNDER_CLAIM_MONTHLY_FEE_USD = 39;
export const COMMUNITY_CONTRIBUTION_FEE_USD = 3;
export const COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH = 2;

function getMonthKey(date = new Date()) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFounderUpdates(slug: string) {
  return founderUpdatesBySlug.get(slug) ?? [];
}

function getCommunityContributions(slug: string) {
  return communityContributionsBySlug.get(slug) ?? [];
}

function getTimeline(slug: string) {
  return timelineBySlug.get(slug) ?? [];
}

function setFounderUpdates(slug: string, updates: FounderClaimUpdateSubmission[]) {
  founderUpdatesBySlug.set(slug, updates.slice(0, 100));
}

function setCommunityContributions(slug: string, entries: CommunityContributionSubmission[]) {
  communityContributionsBySlug.set(slug, entries.slice(0, 200));
}

function setTimeline(slug: string, events: ProjectTimelineEvent[]) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
  timelineBySlug.set(slug, sorted.slice(-120));
}

function addTimelineEvent(event: ProjectTimelineEvent) {
  const existing = getTimeline(event.slug);
  setTimeline(event.slug, [...existing, event]);
}

function parseFounderNames(raw?: string) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function ensureSystemTimelineStart(
  slug: string,
  foundedAt: string | null | undefined,
  collectionName: string
) {
  if (!foundedAt) {
    return;
  }
  const existing = getTimeline(slug);
  const alreadyHasStart = existing.some((event) => event.source === "system");
  if (alreadyHasStart) {
    return;
  }

  addTimelineEvent({
    id: createId("timeline"),
    slug,
    source: "system",
    title: "Project founded",
    description: `${collectionName} started building.`,
    occurredAt: foundedAt,
    submittedAt: new Date().toISOString(),
    submittedBy: "collect-digital",
    verified: true,
  });
}

interface SubmitFounderUpdateInput {
  walletAddress: string;
  monthlyFeeConfirmed: boolean;
  founders?: string;
  team?: string;
  roadmap?: string;
  revenue?: string;
  token?: string;
  x?: string;
  discord?: string;
  telegram?: string;
  website?: string;
  majorMilestoneTitle?: string;
  majorMilestoneDescription?: string;
  majorMilestoneDate?: string;
}

export function submitFounderClaimUpdate(
  slug: string,
  input: SubmitFounderUpdateInput
): FounderClaimUpdateSubmission {
  if (!input.monthlyFeeConfirmed) {
    throw new Error("Founder monthly claim fee must be confirmed.");
  }

  const now = new Date();
  const submission: FounderClaimUpdateSubmission = {
    id: createId("founder"),
    slug,
    walletAddress: input.walletAddress.trim().toLowerCase(),
    monthKey: getMonthKey(now),
    monthlyFeeUsd: FOUNDER_CLAIM_MONTHLY_FEE_USD,
    submittedAt: now.toISOString(),
    status: "verified",
    relevant: true,
    update: {
      founders: input.founders?.trim() || undefined,
      team: input.team?.trim() || undefined,
      roadmap: input.roadmap?.trim() || undefined,
      revenue: input.revenue?.trim() || undefined,
      token: input.token?.trim() || undefined,
      x: input.x?.trim() || undefined,
      discord: input.discord?.trim() || undefined,
      telegram: input.telegram?.trim() || undefined,
      website: input.website?.trim() || undefined,
      majorMilestoneTitle: input.majorMilestoneTitle?.trim() || undefined,
      majorMilestoneDescription: input.majorMilestoneDescription?.trim() || undefined,
      majorMilestoneDate: input.majorMilestoneDate?.trim() || undefined,
    },
  };

  const existing = getFounderUpdates(slug);
  setFounderUpdates(slug, [submission, ...existing]);

  if (submission.update.majorMilestoneTitle) {
    addTimelineEvent({
      id: createId("timeline"),
      slug,
      source: "founder",
      title: submission.update.majorMilestoneTitle,
      description:
        submission.update.majorMilestoneDescription ??
        "Founder-submitted milestone update.",
      occurredAt: submission.update.majorMilestoneDate || submission.submittedAt,
      submittedAt: submission.submittedAt,
      submittedBy: submission.walletAddress,
      verified: true,
    });
  }

  return submission;
}

interface SubmitCommunityContributionInput {
  walletAddress: string;
  ownershipVerified: boolean;
  contributionFeeConfirmed: boolean;
  feedback: string;
  majorEventTitle?: string;
  majorEventDescription?: string;
  majorEventDate?: string;
}

function countCommunityContributionsForWalletMonth(walletAddress: string, monthKey: string) {
  let count = 0;
  for (const entries of communityContributionsBySlug.values()) {
    count += entries.filter(
      (entry) => entry.walletAddress === walletAddress && entry.monthKey === monthKey
    ).length;
  }
  return count;
}

export function submitCommunityContribution(
  slug: string,
  input: SubmitCommunityContributionInput
): CommunityContributionSubmission {
  const walletAddress = input.walletAddress.trim().toLowerCase();
  const monthKey = getMonthKey();
  const currentCount = countCommunityContributionsForWalletMonth(walletAddress, monthKey);
  if (currentCount >= COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH) {
    throw new Error("Community monthly contribution limit reached for this wallet.");
  }
  if (!input.contributionFeeConfirmed) {
    throw new Error("Community contribution fee must be confirmed.");
  }
  if (!input.ownershipVerified) {
    throw new Error("NFT ownership verification failed for this wallet.");
  }

  const nowIso = new Date().toISOString();
  const submission: CommunityContributionSubmission = {
    id: createId("community"),
    slug,
    walletAddress,
    monthKey,
    submittedAt: nowIso,
    status: "verified",
    ownershipVerified: true,
    contributionFeeUsd: COMMUNITY_CONTRIBUTION_FEE_USD,
    feedback: input.feedback.trim(),
    majorEventTitle: input.majorEventTitle?.trim() || undefined,
    majorEventDescription: input.majorEventDescription?.trim() || undefined,
    majorEventDate: input.majorEventDate?.trim() || undefined,
  };

  const existing = getCommunityContributions(slug);
  setCommunityContributions(slug, [submission, ...existing]);

  if (submission.majorEventTitle) {
    addTimelineEvent({
      id: createId("timeline"),
      slug,
      source: "community",
      title: submission.majorEventTitle,
      description:
        submission.majorEventDescription ?? "Community-submitted major project event.",
      occurredAt: submission.majorEventDate || submission.submittedAt,
      submittedAt: submission.submittedAt,
      submittedBy: submission.walletAddress,
      verified: true,
    });
  }

  return submission;
}

export function getProjectGovernanceSnapshot(slug: string): ProjectGovernanceSnapshot {
  return {
    slug,
    founderUpdates: getFounderUpdates(slug),
    communityContributions: getCommunityContributions(slug),
    timeline: getTimeline(slug),
    communityMonthlyLimit: COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH,
  };
}

export function getVerifiedProfilePatch(
  slug: string
): Partial<CollectionProfile> & { founderNames?: string[] } {
  const verifiedUpdates = getFounderUpdates(slug).filter(
    (entry) => entry.status === "verified" && entry.relevant
  );
  if (!verifiedUpdates.length) {
    return {};
  }

  const latestFirst = [...verifiedUpdates].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
  const patch: Partial<CollectionProfile> & { founderNames?: string[] } = {
    claimed: true,
    dataConfidenceLevel: "verified",
  };

  for (const update of latestFirst) {
    if (!patch.officialWebsite && update.update.website) {
      patch.officialWebsite = update.update.website;
    }
    if (!patch.xUrl && update.update.x) {
      patch.xUrl = update.update.x;
    }
    if (!patch.discordUrl && update.update.discord) {
      patch.discordUrl = update.update.discord;
    }
    if (!patch.telegramUrl && update.update.telegram) {
      patch.telegramUrl = update.update.telegram;
    }
    if (!patch.hasBusinessRevenue && update.update.revenue) {
      patch.hasBusinessRevenue = true;
    }
    if (!patch.hasToken && update.update.token) {
      patch.hasToken = true;
    }
    if ((!patch.founderNames || patch.founderNames.length === 0) && update.update.founders) {
      patch.founderNames = parseFounderNames(update.update.founders);
    }
    if (!patch.hasDevFounder && update.update.founders) {
      patch.hasDevFounder = /dev|engineer|builder|cto/i.test(update.update.founders);
    }
  }

  return patch;
}
