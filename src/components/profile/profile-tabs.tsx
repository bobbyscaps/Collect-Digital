"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useProfile } from "./profile-context";

type TabDef = {
  label: string;
  segment: string;
  ownerOnly?: boolean;
};

const TABS: TabDef[] = [
  { label: "Bio", segment: "" },
  { label: "Showcase", segment: "showcase" },
  { label: "Collection", segment: "collection" },
  { label: "Posts", segment: "posts" },
  { label: "Communities", segment: "communities" },
  { label: "Activity", segment: "activity" },
  { label: "Ratings", segment: "ratings" },
  { label: "Settings", segment: "settings", ownerOnly: true },
];

export function ProfileTabs() {
  const { profile, isOwner } = useProfile();
  const pathname = usePathname();
  const base = `/profile/${profile.username}`;

  const visibleTabs = TABS.filter((tab) => !tab.ownerOnly || isOwner);

  return (
    <nav className="mt-6 border-b border-white/10">
      {/* Horizontally scrollable on mobile */}
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleTabs.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active =
            tab.segment === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={tab.label}
              href={href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap rounded-t-md px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
