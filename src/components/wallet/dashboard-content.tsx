"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { WalletShareCard } from "@/components/wallet/wallet-share-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { WalletCollectorRating, WalletPortfolioSummary } from "@/lib/types";

interface DashboardPayload {
  portfolio: WalletPortfolioSummary;
  rating: WalletCollectorRating;
}

export function DashboardContent() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    const wallet = address ?? "demo";
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/wallet/${wallet}`);
      const data = (await response.json()) as DashboardPayload;
      setPayload(data);
      setLoading(false);
    }
    void load();
  }, [address]);

  if (loading || !payload) {
    return <p className="text-sm text-muted-foreground">Loading wallet analytics...</p>;
  }

  const { portfolio, rating } = payload;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Collector Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{rating.collectorScore}</p>
            <Progress value={rating.collectorScore} className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Flipper Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{rating.flipperScore}</p>
            <Progress value={rating.flipperScore} className="mt-3" />
          </CardContent>
        </Card>
        <WalletShareCard rating={rating} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Optimistic value (floor)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{portfolio.optimisticValueEth.toFixed(2)} ETH</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conservative value (best offer)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {portfolio.conservativeValueEth.toFixed(2)} ETH
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Floor vs offer liquidity gap</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{portfolio.floorToOfferGapEth.toFixed(2)} ETH</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Main wallet identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge>{rating.mainBadge.label}</Badge>
            <p className="text-sm text-muted-foreground">{rating.mainBadge.description}</p>
            <div className="flex flex-wrap gap-2">
              {rating.secondaryBadges.map((badge) => (
                <Badge key={badge.key} variant="outline">
                  {badge.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Strengths / Weaknesses</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Strengths</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {rating.strengths.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Weaknesses</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {rating.weaknesses.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signals and opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {portfolio.potentialSellSignals.map((signal) => (
              <div key={signal} className="rounded-md border p-3">
                {signal}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Collection breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {portfolio.positions.map((position) => (
              <div key={position.collectionSlug} className="rounded-md border p-3">
                <p className="font-medium">{position.collectionName}</p>
                <p className="text-muted-foreground">
                  Qty {position.quantity} · Floor {position.floorValueEth.toFixed(2)} ETH ·
                  Offer {position.bestOfferValueEth.toFixed(2)} ETH
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Best collection calls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rating.bestCollectionCalls.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Worst exits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rating.worstExits.map((item) => (
              <p key={item}>• {item}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loyal + trim suggestions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rating.loyalCollections.map((item) => (
              <p key={item}>Loyal to: {item}</p>
            ))}
            {rating.trimSuggestions.map((item) => (
              <p key={item}>Trim idea: {item}</p>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
