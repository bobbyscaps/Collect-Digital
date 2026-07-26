"use client";

import { Activity } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { ProfileSection } from "@/components/profile/ui";

export default function ActivityPage() {
  const { viewerAuthenticated } = useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Unlock activity history"
        description="Log in to access Collector Identity. Activity feeds are not fabricated — they will appear when backed by real events."
        cta="Log in to view activity"
        items={[
          "Wallet sync events",
          "Inventory changes",
          "Achievement awards (coming soon)",
        ]}
      />
    );
  }

  return (
    <ProfileSection
      title="Activity"
      description="Activity history is a future dynamic status module."
    >
      <ProgressiveData
        state="coming_soon"
        data={null}
        message="Activity feed coming soon"
        comingSoon={
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
              <Activity className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-medium">Coming Soon</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Purchases, sales, mints, and contributions will appear from real
              event sources — never sample timelines.
            </p>
          </div>
        }
      />
    </ProfileSection>
  );
}
