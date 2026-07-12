import { NextResponse } from "next/server";

import { getCollectionEvaluation } from "@/lib/opensea/service";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;
  const evaluation = await getCollectionEvaluation(slug);

  return NextResponse.json({ evaluation });
}
