import { NextResponse } from "next/server";

import {
  getCollectionEvents,
  getCollectionListings,
  getCollectionTopOffers,
} from "@/lib/opensea/service";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;

  const [events, listings, offers] = await Promise.all([
    getCollectionEvents(slug),
    getCollectionListings(slug),
    getCollectionTopOffers(slug),
  ]);

  return NextResponse.json({
    slug,
    events,
    listings,
    offers,
  });
}
