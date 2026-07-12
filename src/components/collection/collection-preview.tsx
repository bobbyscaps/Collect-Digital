"use client";

import {
  Clock,
  ExternalLink,
  Globe,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LockedCard } from "@/components/auth/locked-card";
import { XIcon } from "@/components/landing/brand-icons";
import type { CollectionEvaluation, DataConfidenceLevel } from "@/lib/types";

const CONFIDENCE_LABELS: Record<DataConfidenceLevel, string> = {
  auto_generated: "Auto-generated",
  community_funded: "Community funded",
  claimed: "Claimed by project",
  verified: "Verified",
  full_evaluation: "Full evaluation",
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function fmtEth(value: number) {
  return `${value.toFixed(2)} ETH`;
}

export function CollectionPreview({ evaluation }: { evaluation: CollectionEvaluation }) {
  const { ready, authenticated } = usePrivy();
  const canViewFull = ready && authenticated;

  const { profile, marketSnapshot, score } = evaluation;
  const captured = new Date(marketSnapshot.capturedAt);

  return (
    <div className="space-y-6">
      {/* Banner + identity */}
      <Card className="overflow-hidden border-white/10 bg-white/[0.02]">
        <div className="relative h-36 w-full bg-gradient-to-br from-violet-600/40 via-indigo-600/30 to-sky-500/30 sm:h-48">
          {profile.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <span className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-sky-400 text-2xl font-bold text-white ring-4 ring-background">
                {profile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  profile.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {profile.chain}
                  </span>
                </div>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" />
                  {CONFIDENCE_LABELS[profile.dataConfidenceLevel]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {profile.officialWebsite && (
                <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/5">
                  <a href={profile.officialWebsite} target="_blank" rel="noreferrer">
                    <Globe />
                    Website
                  </a>
                </Button>
              )}
              <Button asChild size="sm">
                <a href={profile.openseaUrl} target="_blank" rel="noreferrer">
                  View on OpenSea
                  <ExternalLink />
                </a>
              </Button>
            </div>
          </div>

          {profile.description && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground line-clamp-4">
              {profile.description}
            </p>
          )}

          {/* Social links */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {profile.xUrl && (
              <a
                href={profile.xUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" /> X
              </a>
            )}
            {profile.discordUrl && (
              <a
                href={profile.discordUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Discord
              </a>
            )}
            {profile.contractAddress && (
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {profile.contractAddress.slice(0, 6)}…{profile.contractAddress.slice(-4)}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Public score + market stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/10 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Collect Digital Score
            </p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">
              {Math.round(score.overallScore)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confidence {Math.round(score.confidenceScore)}%
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2">
          <Stat label="Floor Price" value={fmtEth(marketSnapshot.floorPriceEth)} />
          <Stat label="Total Volume" value={fmtEth(marketSnapshot.volume7dEth)} />
          <Stat label="Holders" value={marketSnapshot.holderCount.toLocaleString()} />
          <Stat label="Listed" value={marketSnapshot.listedCount.toLocaleString()} />
          <Stat label="Listed %" value={`${marketSnapshot.listedPct.toFixed(1)}%`} />
          <Stat label="Sales (24h)" value={marketSnapshot.sales24h.toLocaleString()} />
        </div>
      </div>

      {/* Advanced / gated analysis */}
      {canViewFull ? (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Full Score Breakdown
            </h2>
            <div className="mt-4 space-y-4">
              {score.categories.map((category) => (
                <div key={category.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{category.label}</span>
                    <span className="font-semibold">
                      {Math.round(category.score)} / {category.maxPoints}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300"
                      style={{
                        width: `${Math.min(100, (category.score / category.maxPoints) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <LockedCard
          title="Unlock the full Collect Digital evaluation"
          description="Log in to see the complete score breakdown, liquidity, founder and team analysis, risk, whale concentration, historical trends, and pre-mint evaluation."
          cta="Log in to view full analysis"
          items={[
            "Score category breakdown",
            "Liquidity analysis",
            "Founder & team evaluation",
            "Risk & whale concentration",
            "Historical score changes",
            "Pre-mint evaluation",
          ]}
        />
      )}

      {/* Freshness footer */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Data as of {captured.toLocaleString()} · {CONFIDENCE_LABELS[profile.dataConfidenceLevel]}
      </p>
    </div>
  );
}
