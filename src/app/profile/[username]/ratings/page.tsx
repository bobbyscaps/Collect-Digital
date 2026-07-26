"use client";

import { Gauge } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { hasVerifiedCollectorIdentity } from "@/components/collector-identity/no-verified-wallets";
import { ProfileSection } from "@/components/profile/ui";

export default function RatingsPage() {
  const { viewerAuthenticated, isOwner, identity } = useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Collector ratings"
        description="Collector Score and Flipper Score are not implemented on Collector Identity yet. Collect Digital does not show sample ratings."
        cta="Log in to view identity"
        items={[
          "Collector Score (after wallet verification)",
          "Collection Scores (coming soon)",
          "Verified wallet inventory (live)",
        ]}
      />
    );
  }

  const showScores = isOwner && hasVerifiedCollectorIdentity(identity);
  const collectorScore = showScores
    ? identity?.statusModules.collectorScore
    : null;
  const collectionScores = showScores
    ? identity?.statusModules.collectionScores
    : null;

  if (!showScores) {
    return (
      <ProfileSection
        title="Ratings"
        description="Scores appear after you verify a wallet and build your Collector Identity."
      >
        <p className="text-sm text-muted-foreground">
          Verify a connected wallet to unlock Collector Identity. Scoring is not
          available yet and Collect Digital never invents placeholder scores.
        </p>
      </ProfileSection>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileSection
        title="Collector Score"
        description="Dynamic status — current collector scoring is not implemented in this release."
      >
        <ProgressiveData
          state={collectorScore?.state ?? "coming_soon"}
          data={collectorScore?.data ?? null}
          message={collectorScore?.message ?? "Collector Score coming soon"}
          comingSoon={
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                <Gauge className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium">Coming Soon</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                No fabricated Collector Score, Flipper Score, or sample rating is
                shown.
              </p>
            </div>
          }
        />
      </ProfileSection>

      <ProfileSection
        title="Collection Scores"
        description="Per-collection scores are out of scope until a later PR."
      >
        <ProgressiveData
          state={collectionScores?.state ?? "coming_soon"}
          data={collectionScores?.data ?? null}
          message={collectionScores?.message ?? "Collection Scores coming soon"}
        />
      </ProfileSection>
    </div>
  );
}
