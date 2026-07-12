"use client";

import { EyeOff, Filter, Layers, Search } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import {
  EmptyState,
  PlaceholderCard,
  PrivateValue,
  ProfileSection,
  Stat,
} from "@/components/profile/ui";
import { formatEth } from "@/lib/profile/data";

export default function CollectionPage() {
  const { profile, isOwner, canViewFinancials, canViewCollection, viewerAuthenticated } =
    useProfile();
  const { portfolio } = profile;

  if (!canViewCollection) {
    return (
      <ProfileSection title="Collection">
        <EmptyState
          icon={EyeOff}
          title="This collection is private"
          description="The owner has chosen to keep their collection hidden from visitors."
        />
      </ProfileSection>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="NFTs Owned" value={portfolio.nftCount} />
        <Stat label="Collections" value={portfolio.collectionCount} />
        <Stat
          label="Floor Value"
          value={canViewFinancials ? formatEth(portfolio.floorValueEth) : <PrivateValue />}
        />
        <Stat
          label="Best-Offer Value"
          value={
            canViewFinancials ? formatEth(portfolio.bestOfferValueEth) : <PrivateValue />
          }
        />
        <Stat
          label="Hidden NFTs"
          value={isOwner ? portfolio.hiddenCount : <PrivateValue label="Owner only" />}
        />
      </div>

      <ProfileSection
        title="All NFTs"
        description="Search, filter, and group across every collection this collector owns."
      >
        {/* Filter bar (placeholder) */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Search NFTs and collections
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            Groups
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <PlaceholderCard
              key={index}
              title={`NFT #${index + 1}`}
              meta={
                profile.favoriteCollections[index % profile.favoriteCollections.length]
              }
            />
          ))}
        </div>
      </ProfileSection>

      {!viewerAuthenticated && (
        <LockedCard
          title="Unlock full collection analysis"
          description="Log in to see portfolio value, floor and best-offer valuations, holding periods, and collection-level analytics."
          cta="Log in to view analysis"
          items={[
            "Portfolio value",
            "Floor & best-offer value",
            "Holding periods",
            "Collection analytics",
          ]}
        />
      )}

      {isOwner && (
        <ProfileSection
          title="Display Controls"
          description="Owners can control public/private display and hide individual NFTs."
        >
          <EmptyState
            icon={EyeOff}
            title="Public / private controls coming soon"
            description="Toggle collection visibility and hide specific pieces from your public profile."
          />
        </ProfileSection>
      )}
    </div>
  );
}
