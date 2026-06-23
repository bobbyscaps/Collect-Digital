import { NextResponse } from "next/server";

import { getCollectionEvaluation } from "@/lib/opensea/service";
import {
  COMMUNITY_CONTRIBUTION_FEE_USD,
  COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH,
  FOUNDER_CLAIM_MONTHLY_FEE_USD,
  ensureSystemTimelineStart,
  getProjectGovernanceSnapshot,
} from "@/lib/project-governance/store";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;
  const evaluation = await getCollectionEvaluation(slug);
  ensureSystemTimelineStart(slug, evaluation.profile.foundedAt, evaluation.profile.name);
  const governance = getProjectGovernanceSnapshot(slug);

  return NextResponse.json({
    governance,
    pricing: {
      founderClaimMonthlyFeeUsd: FOUNDER_CLAIM_MONTHLY_FEE_USD,
      communityContributionFeeUsd: COMMUNITY_CONTRIBUTION_FEE_USD,
    },
    limits: {
      communityContributionsPerWalletPerMonth:
        COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH,
    },
  });
}
