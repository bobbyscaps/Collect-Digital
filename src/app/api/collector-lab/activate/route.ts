import { NextResponse } from "next/server";

import { setActiveCollectorWeights } from "@/lib/scoring/collector-weights";

// NOTE: Intentionally open for now so anyone can tune the collector formula.
// TODO: gate this with requireAdmin (see src/lib/admin/verify.ts) before launch.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    weights?: unknown;
  } | null;

  try {
    const weights = await setActiveCollectorWeights(body?.weights);
    return NextResponse.json({ weights });
  } catch {
    return NextResponse.json(
      { error: "Invalid collector weights payload." },
      { status: 400 }
    );
  }
}
