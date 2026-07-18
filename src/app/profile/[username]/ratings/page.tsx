"use client";

import { Award, ThumbsDown, ThumbsUp } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import {
  PrivateValue,
  ProfileSection,
  Stat,
  TagChips,
} from "@/components/profile/ui";
import { formatEth } from "@/lib/profile/data";

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function RatingsPage() {
  const { profile, canViewFinancials, viewerAuthenticated } = useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Unlock the full Collector Rating"
        description="Log in to see the full Collector Score and Flipper Score breakdown, strengths and weaknesses, best collection calls, most profitable flips, and badge history."
        cta="Log in to view full ratings"
        items={[
          "Collector Score breakdown",
          "Flipper Score breakdown",
          "Strengths & weaknesses",
          "Best collection calls",
          "Most profitable flips",
          "Badge history",
        ]}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Collector Score" value={profile.collectorScore} hint="Top 8% of collectors" />
        <Stat label="Flipper Score" value={profile.flipperScore} hint="Balanced trader" />
        <Stat label="Collector Identity" value={profile.collectorStyle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection title="Score Breakdown">
          <div className="space-y-4">
            <ScoreBar label="Conviction" value={88} />
            <ScoreBar label="Diversification" value={72} />
            <ScoreBar label="Timing" value={64} />
            <ScoreBar label="Community" value={91} />
            <ScoreBar label="Longevity" value={80} />
          </div>
        </ProfileSection>

        <div className="space-y-6">
          <ProfileSection title="Strengths">
            <div className="space-y-2">
              {["Blue-chip conviction", "Strong community participation", "Long holding periods"].map(
                (item) => (
                  <p key={item} className="flex items-center gap-2 text-sm">
                    <ThumbsUp className="h-4 w-4 text-emerald-300" />
                    {item}
                  </p>
                )
              )}
            </div>
          </ProfileSection>
          <ProfileSection title="Weaknesses">
            <div className="space-y-2">
              {["Concentrated in a few collections", "Limited activity on newer chains"].map(
                (item) => (
                  <p key={item} className="flex items-center gap-2 text-sm">
                    <ThumbsDown className="h-4 w-4 text-amber-300" />
                    {item}
                  </p>
                )
              )}
            </div>
          </ProfileSection>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ProfileSection title="Best Collection Calls">
          <TagChips items={["Pudgy Penguins", "Azuki", "Milady"]} />
        </ProfileSection>
        <ProfileSection title="Most Profitable Flips">
          {canViewFinancials ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Cool Cat #900</span>
                <span className="font-semibold text-emerald-300">
                  +{formatEth(4.2)}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Doodle #12</span>
                <span className="font-semibold text-emerald-300">
                  +{formatEth(2.7)}
                </span>
              </li>
            </ul>
          ) : (
            <PrivateValue label="Financials private" />
          )}
        </ProfileSection>
        <ProfileSection title="Longest-Held NFTs">
          <TagChips items={["BAYC #500 · 3y", "Punk #77 · 2y", "Squiggle #9 · 2y"]} />
        </ProfileSection>
      </div>

      <ProfileSection title="Badge History">
        <div className="space-y-2">
          {[profile.mainBadge, ...profile.secondaryBadges].map((badge) => (
            <p key={badge} className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-indigo-300" />
              {badge}
            </p>
          ))}
        </div>
      </ProfileSection>
    </div>
  );
}
