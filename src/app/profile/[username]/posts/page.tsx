"use client";

import { MessageCircle } from "lucide-react";

import { EmptyState, ProfileSection } from "@/components/profile/ui";
import { cn } from "@/lib/utils";

const FILTERS = [
  "Posts",
  "Replies",
  "Media",
  "Quote Posts",
  "Community Posts",
  "Likes",
];

export default function PostsPage() {
  return (
    <ProfileSection title="Posts">
      <div className="mb-5 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((filter, index) => (
          <button
            key={filter}
            type="button"
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
              index === 0
                ? "border-white/20 bg-white/10 text-foreground"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground"
            )}
          >
            {filter}
          </button>
        ))}
      </div>

      <EmptyState
        icon={MessageCircle}
        title="No posts yet"
        description="Posts, replies, media, quote posts, community posts, and liked posts will appear here."
      />
    </ProfileSection>
  );
}
