import { NextResponse } from "next/server";

import { getCollectionEvaluation } from "@/lib/opensea/service";
import { computeCollectionScore } from "@/lib/scoring/engine";
import { getActiveScoringModelVersion } from "@/lib/scoring/repository";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;
  const evaluation = await getCollectionEvaluation(slug);
  const version = await getActiveScoringModelVersion();
  const score = computeCollectionScore(evaluation, version);

  return NextResponse.json({ score, version });
}
