import { NextResponse } from "next/server";

import { MOCK_WALLET_METRICS } from "@/lib/mock-data";
import { getWalletPortfolio } from "@/lib/opensea/service";
import { computeWalletCollectorRating } from "@/lib/scoring/wallet-collector";

interface RouteContext {
  params: Promise<{ address: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { address } = await params;
  const portfolio = await getWalletPortfolio(address);
  const metrics = { ...MOCK_WALLET_METRICS, walletAddress: address };
  const rating = computeWalletCollectorRating(metrics);

  return NextResponse.json({
    portfolio,
    rating,
  });
}
