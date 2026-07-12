import { NextRequest, NextResponse } from "next/server";

import { searchCollections } from "@/lib/opensea/service";
import { searchCollectors } from "@/lib/profile/data";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  // Reuse the existing collection search service (live providers + fallbacks).
  const [collections, collectors] = await Promise.all([
    searchCollections(query).catch((error) => {
      console.error("Collection search failed", error);
      return [];
    }),
    Promise.resolve(searchCollectors(query, limit ?? 8)),
  ]);

  const trimmedCollections = limit ? collections.slice(0, limit) : collections;

  return NextResponse.json({
    query,
    collections: trimmedCollections,
    collectors,
  });
}
