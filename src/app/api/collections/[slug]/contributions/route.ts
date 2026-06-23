import { NextResponse } from "next/server";
import { z } from "zod";

import { getWalletPortfolio } from "@/lib/opensea/service";
import {
  COMMUNITY_CONTRIBUTION_FEE_USD,
  COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH,
  submitCommunityContribution,
} from "@/lib/project-governance/store";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const schema = z.object({
  walletAddress: z.string().min(4),
  contributionFeeConfirmed: z.boolean().optional().default(false),
  feedback: z.string().min(8),
  majorEventTitle: z.string().optional(),
  majorEventDescription: z.string().optional(),
  majorEventDate: z.string().optional(),
});

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function walletOwnsCollection(
  positions: { collectionSlug: string; collectionName: string; quantity: number }[],
  slug: string
) {
  const normalizedSlug = normalize(slug);
  return positions.some((position) => {
    const bySlug = normalize(position.collectionSlug) === normalizedSlug;
    const byName = normalize(position.collectionName).includes(normalizedSlug);
    return position.quantity > 0 && (bySlug || byName);
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid community contribution payload." },
      { status: 400 }
    );
  }

  const walletPortfolio = await getWalletPortfolio(parsed.data.walletAddress);
  const ownershipVerified = walletOwnsCollection(walletPortfolio.positions, slug);

  try {
    const submission = submitCommunityContribution(slug, {
      ...parsed.data,
      ownershipVerified,
    });
    return NextResponse.json({
      success: true,
      message: "Community contribution accepted and added to verification timeline.",
      contributionFeeUsd: COMMUNITY_CONTRIBUTION_FEE_USD,
      monthlyLimit: COMMUNITY_CONTRIBUTIONS_PER_WALLET_PER_MONTH,
      submission,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        ownershipVerified,
        message:
          error instanceof Error
            ? error.message
            : "Unable to submit community contribution.",
      },
      { status: 400 }
    );
  }
}
