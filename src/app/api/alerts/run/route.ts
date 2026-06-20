import { NextResponse } from "next/server";

import { detectCollectionAlerts } from "@/lib/alerts/engine";
import { getTrendingCollections } from "@/lib/opensea/service";

export async function GET() {
  const collections = await getTrendingCollections();
  const alerts = collections.flatMap((collection) =>
    detectCollectionAlerts(collection).map((alert) => ({
      collectionSlug: collection.profile.slug,
      ...alert,
    }))
  );

  return NextResponse.json({ alerts, generatedAt: new Date().toISOString() });
}
