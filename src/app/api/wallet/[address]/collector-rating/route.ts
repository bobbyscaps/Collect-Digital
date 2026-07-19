import { NextResponse } from "next/server";

import { MOCK_WALLET_METRICS } from "@/lib/mock-data";
import { getActiveCollectorWeights } from "@/lib/scoring/collector-weights";
import { computeWalletCollectorRating } from "@/lib/scoring/wallet-collector";
import { deriveWalletMetrics } from "@/lib/scoring/wallet-metrics";

interface RouteContext {
  params: Promise<{ address: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { address } = await params;
  const weights = await getActiveCollectorWeights();

  const onchain = await deriveWalletMetrics(address);
  if (onchain) {
    return NextResponse.json({
      source: "onchain",
      rating: computeWalletCollectorRating(onchain, weights),
      metrics: onchain,
    });
  }

  const fallbackMetrics = { ...MOCK_WALLET_METRICS, walletAddress: address };
  return NextResponse.json({
    source: "fallback",
    rating: computeWalletCollectorRating(fallbackMetrics, weights),
    metrics: fallbackMetrics,
  });
}
