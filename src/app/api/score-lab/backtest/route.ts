import { NextResponse } from "next/server";

import { MOCK_COLLECTIONS, MOCK_SCORING_VERSIONS } from "@/lib/mock-data";
import { computeCollectionScore } from "@/lib/scoring/engine";

export async function GET() {
  const results = MOCK_SCORING_VERSIONS.map((version) => {
    const scores = MOCK_COLLECTIONS.map((collection) =>
      computeCollectionScore(collection, version).overallScore
    );
    const avgScore = scores.reduce((acc, score) => acc + score, 0) / scores.length;
    return {
      versionId: version.id,
      versionName: version.versionName,
      averageScore: Math.round(avgScore * 10) / 10,
      modeledLongTermFit: Math.round((avgScore / 100) * 82),
    };
  });

  return NextResponse.json({
    mode: "historical_backtest",
    results,
    note: "Backtest API scaffold. Replace with historical outcomes dataset for production.",
  });
}
