"use client";

import { Users } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { ProfileSection } from "@/components/profile/ui";

export default function CommunitiesPage() {
  const { identity, isOwner, viewerAuthenticated } = useProfile();

  const section =
    isOwner && identity
      ? identity.statusModules.communities
      : {
          state: "coming_soon" as const,
          data: null,
          lastUpdatedAt: null,
          message: viewerAuthenticated
            ? "Communities coming soon"
            : "Communities coming soon — log in for Collector Identity.",
        };

  return (
    <ProfileSection
      title="Token-Gated Communities"
      description="Communities are a dynamic status module. They are not implemented yet — never populated with sample rows."
    >
      <ProgressiveData
        state={section.state}
        data={section.data}
        message={section.message}
        comingSoon={
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-medium">Coming Soon</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Token-gated communities will appear here from real membership data.
            </p>
          </div>
        }
      />
    </ProfileSection>
  );
}
