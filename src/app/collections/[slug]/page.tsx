import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
/* eslint-disable @next/next/no-img-element */

import { FloorChart } from "@/components/collection/floor-chart";
import { UserScoreGauges } from "@/components/collection/user-score-gauges";
import { WikiEditor } from "@/components/collection/wiki-editor";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { detectCollectionAlerts } from "@/lib/alerts/engine";
import { getCollectionEvaluation } from "@/lib/opensea/service";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const evaluation = await getCollectionEvaluation(slug);

  if (!evaluation) {
    return notFound();
  }

  const { profile, marketSnapshot, score } = evaluation;
  const alerts = detectCollectionAlerts(evaluation);
  const heroImage = profile.bannerUrl || profile.imageUrl;

  return (
    <div className="space-y-8">
      {heroImage ? (
        <img
          src={heroImage}
          alt={`${profile.name} banner`}
          className="h-44 w-full rounded-xl border object-cover md:h-56"
        />
      ) : null}
      <section className="grid gap-6 rounded-xl border p-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {profile.imageUrl ? (
              <img
                src={profile.imageUrl}
                alt={profile.name}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : null}
            <h1 className="text-3xl font-bold">{profile.name}</h1>
            <Badge variant="outline">{profile.dataConfidenceLevel}</Badge>
            {profile.claimed ? <Badge>Claimed</Badge> : null}
            {profile.verified ? <Badge variant="secondary">Verified</Badge> : null}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {profile.description ?? "Collection profile summary pending community edits."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={profile.openseaUrl} target="_blank">
                View on OpenSea
                <ExternalLink className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/claimed/${slug}`}>Claim this project</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href={`/upgrade/${slug}`}>Fund full evaluation</Link>
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>CD score + your score</CardTitle>
          </CardHeader>
          <CardContent>
            <UserScoreGauges evaluation={evaluation} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Floor price"
          value={`${marketSnapshot.floorPriceEth.toFixed(2)} ETH`}
          hint={`${marketSnapshot.floorChange24hPct.toFixed(1)}% in 24h`}
        />
        <MetricCard
          label="Holders"
          value={marketSnapshot.holderCount.toLocaleString()}
          hint={`${marketSnapshot.uniqueOwnerPct.toFixed(1)}% unique owners`}
        />
        <MetricCard
          label="Sales volume (24h)"
          value={`${marketSnapshot.volume24hEth.toFixed(1)} ETH`}
          hint={`${marketSnapshot.sales24h.toFixed(0)} sales`}
        />
        <MetricCard
          label="Top offer / Bid depth"
          value={`${marketSnapshot.topOfferEth.toFixed(2)} ETH`}
          hint={`${marketSnapshot.bidDepthEth.toFixed(1)} ETH bid depth`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Floor price trend</CardTitle>
          </CardHeader>
          <CardContent>
            <FloorChart currentFloor={marketSnapshot.floorPriceEth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {score.categories.map((category) => (
              <div key={category.category} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{category.label}</p>
                <p className="text-muted-foreground">
                  {category.score.toFixed(1)} / {category.maxPoints}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Market and liquidity detail</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3 text-sm">
              <p>Listed count</p>
              <p className="font-semibold">{marketSnapshot.listedCount.toLocaleString()}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p>Listed supply %</p>
              <p className="font-semibold">{marketSnapshot.listedPct.toFixed(2)}%</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p>Liquidity score hint</p>
              <p className="font-semibold">
                {(
                  (marketSnapshot.topOfferEth / marketSnapshot.floorPriceEth) *
                  100
                ).toFixed(1)}
                %
              </p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p>Whale concentration</p>
              <p className="font-semibold">
                {marketSnapshot.whaleConcentrationPct
                  ? `${marketSnapshot.whaleConcentrationPct.toFixed(1)}%`
                  : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project intelligence</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>Age of project: {profile.foundedAt ? "Established" : "Unknown"}</p>
            <p>Coin/token: {profile.hasToken ? "Yes" : "No"}</p>
            <p>Reward platform: {profile.hasRewardPlatform ? "Yes" : "No"}</p>
            <p>IRL events: {profile.hasIrlEvents ? "Yes" : "No"}</p>
            <p>Business revenue: {profile.hasBusinessRevenue ? "Yes" : "No"}</p>
            <p>Dev founder: {profile.hasDevFounder ? "Yes" : "No"}</p>
            <p>Founder/team: {profile.founderNames?.join(", ") || "Community sourced"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why this score?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {score.explainability.map((item) => (
              <div key={item.factorKey} className="rounded-md border p-3">
                <p className="font-medium">
                  {item.delta >= 0 ? "+" : ""}
                  {item.delta} {item.label}
                </p>
                <p className="text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts and insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {alerts.length === 0 ? (
              <p className="text-muted-foreground">No major alert signals right now.</p>
            ) : (
              alerts.map((alert) => (
                <div key={alert.type} className="rounded-md border p-3">
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-muted-foreground">{alert.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wiki / project history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <WikiEditor slug={slug} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Community notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Holder sentiment and community commentary from verified contributors.</p>
            <p>Potential risks, execution wins, and culture signals are tracked here.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
