"use client";

import { Layers } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { hasNoVerifiedWallets } from "@/components/collector-identity/no-verified-wallets";
import { EmptyState, ProfileSection, Stat } from "@/components/profile/ui";

export default function CollectionPage() {
  const { isOwner, viewerAuthenticated, identity, identityLoading } =
    useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Unlock real collection inventory"
        description="Log in to see verified-wallet inventory summaries. Floor values, NFT galleries, and marketplace enrichment are not shown until they are backed by real data."
        cta="Log in to view inventory"
        items={[
          "Collections count",
          "Unique tokens",
          "Inventory quantities",
          "Latest sync status",
        ]}
      />
    );
  }

  if (!isOwner || !identity) {
    return (
      <ProfileSection title="Collection">
        <EmptyState
          icon={Layers}
          title={identityLoading ? "Loading inventory…" : "Inventory unavailable"}
          description="Collection inventory is loaded from your authenticated Collector Identity. NFT gallery and marketplace enrichment are out of scope for this release."
        />
      </ProfileSection>
    );
  }

  // Header already shows the single no-verified-wallets empty state.
  if (hasNoVerifiedWallets(identity)) {
    return (
      <ProfileSection title="Collection">
        <p className="text-sm text-muted-foreground">
          Collection inventory appears after you verify a wallet and sync
          collectibles.
        </p>
      </ProfileSection>
    );
  }

  return (
    <div className="space-y-6">
      <ProgressiveData
        state={identity.inventory.state}
        data={identity.inventory.data}
        lastUpdatedAt={identity.inventory.lastUpdatedAt}
        message={identity.inventory.message}
        render={(data) => (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Collections" value={data.totalCollections} />
            <Stat label="Unique Tokens" value={data.uniqueTokenCount} />
            <Stat label="Total Quantity" value={data.totalQuantity} />
            <Stat
              label="Inventory Status"
              value={data.inventoryStatus}
              hint={
                identity.inventory.state === "stale" &&
                identity.inventory.lastUpdatedAt
                  ? `Last updated ${new Date(
                      identity.inventory.lastUpdatedAt
                    ).toLocaleString()}`
                  : undefined
              }
            />
          </div>
        )}
      />

      <ProfileSection
        title="Collection Summaries"
        description="Summaries from verified-wallet inventory analysis. No scores or pricing."
      >
        <ProgressiveData
          state={identity.collectionSummaries.state}
          data={identity.collectionSummaries.data}
          lastUpdatedAt={identity.collectionSummaries.lastUpdatedAt}
          message={identity.collectionSummaries.message}
          render={(collections) => (
            <ul className="divide-y divide-white/5">
              {collections.map((collection) => (
                <li
                  key={collection.collectionId}
                  className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {collection.collectionId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {collection.chainNamespace} · {collection.contractAddress}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    <p>{collection.uniqueTokenCount} unique</p>
                    <p>qty {collection.totalQuantity}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        />
      </ProfileSection>

      <ProfileSection title="NFT Gallery">
        <EmptyState
          icon={Layers}
          title="NFT gallery coming soon"
          description="Per-token gallery browsing is not part of Collector Identity integration."
        />
      </ProfileSection>
    </div>
  );
}
