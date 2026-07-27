"use client";

import { Layers } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { CollectionAssets } from "@/components/profile/collection-assets/collection-assets";
import {
  hasNoVerifiedWallets,
  isWalletRegistryUnavailable,
} from "@/components/collector-identity/no-verified-wallets";
import { EmptyState, ProfileSection, Stat } from "@/components/profile/ui";

export default function CollectionPage() {
  const { isOwner, viewerAuthenticated, identity, identityLoading } =
    useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Unlock your NFT collection assets"
        description="Log in to view NFTs from your verified wallets, including token-level metadata and marketplace links."
        cta="Log in to view assets"
        items={[
          "NFT images and names",
          "Token IDs and collection context",
          "Collection floor and top trait floor",
          "Direct OpenSea asset links",
        ]}
      />
    );
  }

  if (!isOwner || !identity) {
    return (
      <ProfileSection title="Collection">
        <EmptyState
          icon={Layers}
          title={identityLoading ? "Loading collection…" : "Collection unavailable"}
          description="Collection assets are only available when viewing your own authenticated profile."
        />
      </ProfileSection>
    );
  }

  if (isWalletRegistryUnavailable(identity)) {
    return (
      <ProfileSection title="Collection">
        <ProgressiveData
          state="error"
          data={null}
          message={
            identity.wallets.message ??
            "Wallet verification is temporarily unavailable. Please try again shortly."
          }
        />
      </ProfileSection>
    );
  }

  // Header already shows the single no-verified-wallets empty state.
  // Do not repeat inventory empty messaging here.
  if (hasNoVerifiedWallets(identity)) {
    return (
      <ProfileSection title="Collection">
        <p
          className="text-sm text-muted-foreground"
          data-testid="collection-awaiting-verification"
        >
          Collection inventory appears after you verify a wallet and sync
          collectibles.
        </p>
      </ProfileSection>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileSection title="Inventory Snapshot">
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
      </ProfileSection>

      <ProfileSection
        title="Collection Assets"
        description="Token-level NFT assets rendered from normalized collector inventory."
      >
        <ProgressiveData
          state={identity.assets.state}
          data={identity.assets.data}
          lastUpdatedAt={identity.assets.lastUpdatedAt}
          message={identity.assets.message}
          render={(assets) => (
            <CollectionAssets assets={assets} view="grid" cardSize="medium" />
          )}
        />
      </ProfileSection>
    </div>
  );
}
