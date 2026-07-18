import { NextRequest, NextResponse } from "next/server";

import { searchCollections } from "@/lib/opensea/service";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const collections = await searchCollections(query);

  return NextResponse.json({ collections });
}
