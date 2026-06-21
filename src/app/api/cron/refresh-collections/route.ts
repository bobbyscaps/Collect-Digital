import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { PROVIDER_REFRESH_INTERVALS } from "@/lib/providers/refresh-config";
import { refreshCollectionSnapshotsJob } from "@/lib/jobs/refresh-collections";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshed = await refreshCollectionSnapshotsJob();
  return NextResponse.json({
    refreshed,
    count: refreshed.length,
    recommendedRefreshMs: PROVIDER_REFRESH_INTERVALS.marketDataMs,
  });
}
