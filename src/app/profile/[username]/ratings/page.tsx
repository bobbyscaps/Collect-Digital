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
import {
  COLLECTOR_SUB_SCORE_LABELS,
  type CollectorSubScores,
} from "@/lib/scoring/wallet-collector";

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

const SUB_SCORE_ORDER = Object.keys(
  COLLECTOR_SUB_SCORE_LABELS
) as (keyof CollectorSubScores)[];

export default function RatingsPage() {
  const { profile, canViewFinancials, viewerAuthenticated } = useProfile();
  const { rating, subScores } = profile;

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
        <Stat label="Collector Score" value={rating.collectorScore} />
        <Stat label="Flipper Score" value={rating.flipperScore} />
        <Stat label="Collector Identity" value={profile.collectorStyle} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection
          title="Score Breakdown"
          description="Normalized sub-scores that blend into the Collector Score."
        >
          <div className="space-y-4">
            {SUB_SCORE_ORDER.map((key) => (
              <ScoreBar
                key={key}
                label={COLLECTOR_SUB_SCORE_LABELS[key]}
                value={Math.round(subScores[key])}
              />
            ))}
          </div>
        </ProfileSection>

        <div className="space-y-6">
          <ProfileSection title="Strengths">
            {rating.strengths.length > 0 ? (
              <div className="space-y-2">
                {rating.strengths.map((item) => (
                  <p key={item} className="flex items-center gap-2 text-sm">
                    <ThumbsUp className="h-4 w-4 text-emerald-300" />
                    {item}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No standout strengths detected yet.
              </p>
            )}
          </ProfileSection>
          <ProfileSection title="Weaknesses">
            {rating.weaknesses.length > 0 ? (
              <div className="space-y-2">
                {rating.weaknesses.map((item) => (
                  <p key={item} className="flex items-center gap-2 text-sm">
                    <ThumbsDown className="h-4 w-4 text-amber-300" />
                    {item}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No notable weaknesses detected.
              </p>
            )}
          </ProfileSection>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ProfileSection title="Best Collection Calls">
          <TagChips items={rating.bestCollectionCalls} />
        </ProfileSection>
        <ProfileSection title="Most Profitable Flips">
          {canViewFinancials ? (
            <ul className="space-y-2 text-sm">
              {rating.mostProfitableFlips.map((flip) => (
                <li key={flip} className="text-muted-foreground">
                  {flip}
                </li>
              ))}
            </ul>
          ) : (
            <PrivateValue label="Financials private" />
          )}
        </ProfileSection>
        <ProfileSection title="Longest-Held NFTs">
          <TagChips items={rating.longestHeldNfts} />
        </ProfileSection>
      </div>

      <ProfileSection title="Badge History">
        <div className="space-y-2">
          {[rating.mainBadge, ...rating.secondaryBadges].map((badge) => (
            <p key={badge.key} className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-indigo-300" />
              <span className="font-medium">{badge.label}</span>
              <span className="text-muted-foreground">— {badge.description}</span>
            </p>
          ))}
        </div>
      </ProfileSection>
    </div>
  );
}
