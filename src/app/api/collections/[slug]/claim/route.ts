import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FOUNDER_CLAIM_MONTHLY_FEE_USD,
  submitFounderClaimUpdate,
} from "@/lib/project-governance/store";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const schema = z.object({
  walletAddress: z.string().min(4),
  monthlyFeeConfirmed: z.boolean().optional().default(false),
  founders: z.string().optional(),
  team: z.string().optional(),
  roadmap: z.string().optional(),
  revenue: z.string().optional(),
  token: z.string().optional(),
  x: z.string().optional(),
  discord: z.string().optional(),
  telegram: z.string().optional(),
  website: z.string().optional(),
  majorMilestoneTitle: z.string().optional(),
  majorMilestoneDescription: z.string().optional(),
  majorMilestoneDate: z.string().optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid founder claim payload." },
      { status: 400 }
    );
  }

  try {
    const submission = submitFounderClaimUpdate(slug, parsed.data);
    return NextResponse.json({
      success: true,
      message:
        "Founder update verified and queued for timeline/CD score impact review.",
      monthlyFeeUsd: FOUNDER_CLAIM_MONTHLY_FEE_USD,
      submission,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to submit founder claim.",
      },
      { status: 400 }
    );
  }
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;
  return NextResponse.json({
    success: true,
    slug,
    monthlyFeeUsd: FOUNDER_CLAIM_MONTHLY_FEE_USD,
  });
}
