import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/verify";
import { saveScoringVersion } from "@/lib/scoring/repository";
import type { ScoringModelVersion } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as ScoringModelVersion | null;
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.categoryWeights !== "object" ||
    !Array.isArray(body.factorRules)
  ) {
    return NextResponse.json(
      { error: "Invalid scoring version payload." },
      { status: 400 }
    );
  }

  const saved = await saveScoringVersion({ ...body, isActive: false });
  return NextResponse.json({ version: saved });
}
