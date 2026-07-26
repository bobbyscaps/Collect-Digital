"use client";

import { Star } from "lucide-react";

import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { ProfileSection } from "@/components/profile/ui";

export default function ShowcasePage() {
  return (
    <div className="space-y-6">
      <ProfileSection
        title="Featured NFTs"
        description="Showcase curation is not part of Collector Identity integration."
      >
        <ProgressiveData
          state="coming_soon"
          data={null}
          message="Showcase coming soon"
          comingSoon={
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                <Star className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium">Coming Soon</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Featured NFT rotation will use real inventory selections — never
                placeholder cards with invented collections.
              </p>
            </div>
          }
        />
      </ProfileSection>
    </div>
  );
}
