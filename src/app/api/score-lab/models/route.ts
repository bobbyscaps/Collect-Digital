import { NextResponse } from "next/server";

import { listScoringVersions } from "@/lib/scoring/repository";

export async function GET() {
  const versions = await listScoringVersions();
  return NextResponse.json({ versions });
}
