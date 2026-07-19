import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/verify";
import { setActiveScoringVersion } from "@/lib/scoring/repository";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "Missing version id." }, { status: 400 });
  }

  try {
    const version = await setActiveScoringVersion(body.id);
    return NextResponse.json({ version });
  } catch {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
}
