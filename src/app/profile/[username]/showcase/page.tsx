"use client";

import { Heart, MessageSquare, RefreshCw, Share2, Star } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import {
  EmptyState,
  PlaceholderCard,
  ProfileSection,
} from "@/components/profile/ui";
import { Button } from "@/components/ui/button";

export default function ShowcasePage() {
  const { profile, isOwner } = useProfile();

  return (
    <div className="space-y-6">
      <ProfileSection
        title="Featured NFTs"
        description="A curated, rotating spotlight of this collector's favorite pieces."
        action={
          isOwner ? (
            <Button variant="outline" size="sm" className="border-white/15 bg-white/5">
              <RefreshCw />
              Rotation settings
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <PlaceholderCard
              key={n}
              title={`Featured #${n}`}
              meta={profile.favoriteCollections[n % profile.favoriteCollections.length]}
              footer={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> —
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> —
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Share2 className="h-3.5 w-3.5" /> —
                  </span>
                </div>
              }
            />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Rotation: {isOwner ? "Automatic (weekly) — configurable by owner" : "Automatic"}
        </p>
      </ProfileSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSection title="Most Recent Acquisitions">
          <EmptyState
            icon={Star}
            title="Recent acquisitions coming soon"
            description="The latest pieces added to this collector's wallet will appear here."
          />
        </ProfileSection>
        <ProfileSection title="Favorite Pieces">
          <EmptyState
            icon={Heart}
            title="Favorites coming soon"
            description="Owner-selected favorite pieces, each with owner notes and a comment thread."
          />
        </ProfileSection>
      </div>

      <ProfileSection title="Owner Notes & Discussion">
        <EmptyState
          icon={MessageSquare}
          title="Per-NFT notes and comment threads"
          description="Every showcased NFT will have owner notes plus a comment thread with likes and shares."
        />
      </ProfileSection>
    </div>
  );
}
