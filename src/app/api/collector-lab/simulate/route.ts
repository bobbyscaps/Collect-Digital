import { NextResponse } from "next/server";

import { getActiveCollectorWeights } from "@/lib/scoring/collector-weights";
import { getSyntheticWalletMetrics } from "@/lib/profile/data";
import {
  blendCollectorScore,
  computeCollectorSubScores,
  type CollectorSubScoreWeights,
} from "@/lib/scoring/wallet-collector";
import { deriveWalletMetrics, isEthAddress } from "@/lib/scoring/wallet-metrics";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    identifier?: string;
    weights?: CollectorSubScoreWeights;
  } | null;

  const identifier = (body?.identifier ?? "satoshi").trim() || "satoshi";
  if (!body?.weights) {
    return NextResponse.json({ error: "Missing weights." }, { status: 400 });
  }

  // Resolve metrics: real on-chain for an address, synthetic otherwise.
  let source: "onchain" | "synthetic" = "synthetic";
  let metrics = getSyntheticWalletMetrics(identifier);
  if (isEthAddress(identifier)) {
    const onchain = await deriveWalletMetrics(identifier);
    if (onchain) {
      metrics = onchain;
      source = "onchain";
    }
  }

  const subScores = computeCollectorSubScores(metrics);
  const activeWeights = await getActiveCollectorWeights();

  return NextResponse.json({
    identifier,
    source,
    subScores,
    baseline: { collectorScore: blendCollectorScore(subScores, activeWeights) },
    candidate: { collectorScore: blendCollectorScore(subScores, body.weights) },
  });
}
