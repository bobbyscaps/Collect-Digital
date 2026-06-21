import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
/* eslint-disable @next/next/no-img-element */

import { CollectionSearch } from "@/components/home/collection-search";
import { ScoreRing } from "@/components/score/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_UPGRADE_CAMPAIGNS } from "@/lib/mock-data";
import { getTrendingCollections } from "@/lib/opensea/service";

export default async function HomePage() {
  const trending = await getTrendingCollections();
  const topScores = [...trending]
    .sort((a, b) => b.score.overallScore - a.score.overallScore)
    .slice(0, 3);
  const biggestMovers = [...trending]
    .sort(
      (a, b) =>
        Math.abs(b.marketSnapshot.floorChange24hPct) -
        Math.abs(a.marketSnapshot.floorChange24hPct)
    )
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-2xl border bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-cyan-500/15 p-6 md:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <Badge variant="secondary" className="w-fit">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            NFTScore + Wiki + Portfolio Intelligence
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Evaluate NFT projects with transparent, versioned scoring.
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Reservoir market aggregation + Alchemy wallet intelligence, editable
            community history, and community-funded deep evaluations without pay-to-win
            scoring.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">Open wallet dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/score-lab">Explore Score Lab</Link>
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Collection search</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Primary data providers: Reservoir + Alchemy. OpenSea is supplemental
              enrichment only.
            </p>
            <CollectionSearch />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Trending projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trending.map((project) => (
              <Link
                key={project.profile.slug}
                href={`/collections/${project.profile.slug}`}
                className="flex items-center justify-between rounded-lg border p-3 transition hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  {project.profile.imageUrl ? (
                    <img
                      src={project.profile.imageUrl}
                      alt={project.profile.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : null}
                  <div>
                    <p className="font-medium">{project.profile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Floor {project.marketSnapshot.floorPriceEth.toFixed(2)} ETH ·{" "}
                      {project.marketSnapshot.floorChange24hPct.toFixed(1)}% 24h
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently upgraded</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_UPGRADE_CAMPAIGNS.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/upgrade/${campaign.collectionSlug}`}
                className="block rounded-lg border p-3 transition hover:bg-accent"
              >
                <p className="font-medium">{campaign.collectionSlug}</p>
                <p className="text-xs text-muted-foreground">
                  ${campaign.raisedUsd} / ${campaign.targetUsd} funded
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top scores</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {topScores.map((collection) => (
              <Link
                href={`/collections/${collection.profile.slug}`}
                key={collection.profile.slug}
                className="rounded-lg border p-4 transition hover:bg-accent"
              >
                {collection.profile.imageUrl ? (
                  <img
                    src={collection.profile.imageUrl}
                    alt={collection.profile.name}
                    className="mx-auto mb-3 h-10 w-10 rounded-full object-cover"
                  />
                ) : null}
                <ScoreRing score={collection.score.overallScore} label={collection.profile.name} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Biggest movers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {biggestMovers.map((collection) => (
              <div
                key={collection.profile.slug}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">{collection.profile.name}</p>
                <p className="text-muted-foreground">
                  Floor move: {collection.marketSnapshot.floorChange24hPct.toFixed(1)}%
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>How scoring works</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Transparent model versions</p>
              <p className="text-xs text-muted-foreground">
                Scores run on versioned formulas and can be compared in Score Lab.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Never pay for score boosts</p>
              <p className="text-xs text-muted-foreground">
                Funding unlocks deeper research only, not direct rating upgrades.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Confidence scoring</p>
              <p className="text-xs text-muted-foreground">
                Data completeness is tracked separately from project score.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Explainability engine</p>
              <p className="text-xs text-muted-foreground">
                Every score lists positive and negative factor contributions.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
