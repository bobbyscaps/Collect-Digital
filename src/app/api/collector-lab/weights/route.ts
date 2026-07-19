import { NextResponse } from "next/server";

import { getActiveCollectorWeights } from "@/lib/scoring/collector-weights";
import { COLLECTOR_SUB_SCORE_WEIGHTS } from "@/lib/scoring/wallet-collector";

export async function GET() {
  const active = await getActiveCollectorWeights();
  return NextResponse.json({ active, default: COLLECTOR_SUB_SCORE_WEIGHTS });
}
