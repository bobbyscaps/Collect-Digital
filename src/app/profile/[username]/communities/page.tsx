"use client";

import { ArrowRight } from "lucide-react";

import { ProfileSection } from "@/components/profile/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CommunityRow = {
  name: string;
  projectScore: number;
  communityScore: number;
  role: string;
  activity: string;
  initials: string;
};

const COMMUNITIES: CommunityRow[] = [
  {
    name: "Bored Ape Yacht Club",
    projectScore: 92,
    communityScore: 88,
    role: "Holder",
    activity: "12 new posts today",
    initials: "BA",
  },
  {
    name: "Pudgy Penguins",
    projectScore: 90,
    communityScore: 94,
    role: "Moderator",
    activity: "Event starts in 2 days",
    initials: "PP",
  },
  {
    name: "VeeFriends",
    projectScore: 84,
    communityScore: 80,
    role: "Holder",
    activity: "New wiki revision",
    initials: "VF",
  },
];

export default function CommunitiesPage() {
  return (
    <ProfileSection
      title="Token-Gated Communities"
      description="Communities this collector belongs to, unlocked automatically by their wallet."
    >
      <div className="space-y-3">
        {COMMUNITIES.map((community) => (
          <Card key={community.name} className="border-white/10 bg-white/[0.03]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-sm font-bold text-white">
                  {community.initials}
                </span>
                <div>
                  <p className="font-medium">{community.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Project score {community.projectScore}</span>
                    <span>Community score {community.communityScore}</span>
                    <span className="text-indigo-300">{community.role}</span>
                    <span>{community.activity}</span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-white/15 bg-white/5 hover:bg-white/10"
              >
                Enter Community
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </ProfileSection>
  );
}
