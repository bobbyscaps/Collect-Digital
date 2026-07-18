"use client";

import {
  Award,
  Coins,
  MessageSquare,
  ShoppingCart,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProfileSection } from "@/components/profile/ui";

type ActivityRow = {
  icon: LucideIcon;
  label: string;
  detail: string;
  when: string;
};

const ACTIVITY: ActivityRow[] = [
  { icon: ShoppingCart, label: "Purchased", detail: "Azuki #1234", when: "3h ago" },
  { icon: Tag, label: "Sold", detail: "Cool Cat #900", when: "1d ago" },
  { icon: Sparkles, label: "Minted", detail: "New Genesis Drop", when: "2d ago" },
  { icon: MessageSquare, label: "Commented", detail: "on Pudgy Penguins #77", when: "4d ago" },
  { icon: Users, label: "Contributed", detail: "BAYC community wiki", when: "5d ago" },
  { icon: Coins, label: "Earned points", detail: "+120 Collect Points", when: "5d ago" },
  { icon: Award, label: "Badge achieved", detail: "Community Contributor", when: "1w ago" },
];

export default function ActivityPage() {
  const { viewerAuthenticated } = useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Unlock full activity history"
        description="Log in to view purchases, sales, mints, transfers, comments, community contributions, point earnings, and badge achievements."
        cta="Log in to view activity"
        items={[
          "Purchases & sales",
          "Mints & transfers",
          "Comments & contributions",
          "Point earnings",
          "Badge achievements",
        ]}
      />
    );
  }

  return (
    <ProfileSection
      title="Activity"
      description="Purchases, sales, mints, transfers, comments, contributions, points, and badges."
    >
      <ul className="relative space-y-1 before:absolute before:left-[19px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-white/10">
        {ACTIVITY.map((row, index) => (
          <li key={index} className="relative flex items-center gap-4 py-2.5">
            <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-background text-indigo-300">
              <row.icon className="h-4 w-4" />
            </span>
            <div className="flex flex-1 items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-medium">{row.label}</span>{" "}
                <span className="text-muted-foreground">{row.detail}</span>
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">{row.when}</span>
            </div>
          </li>
        ))}
      </ul>
    </ProfileSection>
  );
}
