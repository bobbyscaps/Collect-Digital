import Link from "next/link";
import { BadgeCheck, Gauge, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { CollectionProfile } from "@/lib/types";
import type { CollectorPreview } from "@/lib/profile/data";

export function CollectionResultCard({ collection }: { collection: CollectionProfile }) {
  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      <Card className="overflow-hidden border-white/10 bg-white/[0.03] transition-colors group-hover:border-white/20 group-hover:bg-white/[0.05]">
        <div className="relative aspect-[3/1] w-full bg-gradient-to-br from-violet-500/25 via-indigo-500/15 to-sky-400/25">
          {collection.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={collection.bannerUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <CardContent className="p-4">
          <div className="-mt-9 mb-2 flex items-end gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-violet-500/40 to-sky-400/40 text-xs font-semibold text-white ring-4 ring-background">
              {collection.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={collection.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                collection.name.slice(0, 2).toUpperCase()
              )}
            </span>
          </div>
          <p className="truncate text-sm font-semibold">{collection.name}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="capitalize">{collection.chain}</span>
            {typeof collection.baseScore === "number" && (
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                Score {collection.baseScore}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function CollectorResultCard({ collector }: { collector: CollectorPreview }) {
  return (
    <Link href={`/profile/${collector.username}`} className="group block">
      <Card className="border-white/10 bg-white/[0.03] transition-colors group-hover:border-white/20 group-hover:bg-white/[0.05]">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-sm font-bold text-white">
            {collector.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{collector.displayName}</p>
              {collector.walletVerified && (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">@{collector.username}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                {collector.collectorScore}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {collector.followers.toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
