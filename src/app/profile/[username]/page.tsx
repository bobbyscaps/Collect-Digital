"use client";

import { Award, Wallet } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { ProfileSection } from "@/components/profile/ui";
import { LockedCard } from "@/components/auth/locked-card";

export default function BioPage() {
  const { isOwner, viewerAuthenticated, identity, identityLoading, identityError } =
    useProfile();

  if (!viewerAuthenticated) {
    return (
      <LockedCard
        title="Collector Identity"
        description="Log in to load your real Collector Identity from verified wallets and inventory. Collect Digital never shows fabricated analytics."
        cta="Log in to view identity"
        items={[
          "Verified wallets",
          "Inventory status",
          "Collection summaries",
          "Achievements (coming soon)",
        ]}
      />
    );
  }

  if (!isOwner) {
    return (
      <ProfileSection
        title="Collector Identity"
        description="Live identity metrics are available on your own authenticated profile."
      >
        <p className="text-sm text-muted-foreground">
          Unsupported public social modules display Coming Soon. No sample scores,
          followers, or bios are shown.
        </p>
      </ProfileSection>
    );
  }

  if (identityLoading && !identity) {
    return (
      <ProfileSection title="Collector Identity">
        <ProgressiveData state="loading" data={null}>
          {() => null}
        </ProgressiveData>
      </ProfileSection>
    );
  }

  if (identityError && !identity) {
    return (
      <ProfileSection title="Collector Identity">
        <ProgressiveData state="error" data={null} message={identityError}>
          {() => null}
        </ProgressiveData>
      </ProfileSection>
    );
  }

  if (!identity) {
    return (
      <ProfileSection title="Collector Identity">
        <ProgressiveData state="empty" data={null} message="No identity loaded.">
          {() => null}
        </ProgressiveData>
      </ProfileSection>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <ProfileSection title="About">
          <ProgressiveData
            state={
              identity.identity.data?.bio
                ? identity.identity.state
                : "empty"
            }
            data={identity.identity.data}
            message={
              identity.identity.data?.bio
                ? identity.identity.message
                : "No bio yet."
            }
          >
            {(data) => (
              <p className="text-sm leading-relaxed text-foreground/90">
                {data?.bio}
              </p>
            )}
          </ProgressiveData>
        </ProfileSection>

        <ProfileSection
          title="Achievements"
          description="Permanent badges earned once and kept in collector history."
        >
          <ProgressiveData
            state={identity.achievements.state}
            data={identity.achievements.data}
            message={identity.achievements.message}
          >
            {() => null}
          </ProgressiveData>
        </ProfileSection>

        <ProfileSection title="Verified Wallets">
          <ProgressiveData
            state={identity.wallets.state}
            data={identity.wallets.data}
            lastUpdatedAt={identity.wallets.lastUpdatedAt}
            message={identity.wallets.message}
          >
            {(data) => (
              <ul className="divide-y divide-white/5">
                {data.verifiedWallets.map((wallet) => (
                  <li
                    key={wallet.walletId}
                    className="flex items-center gap-3 py-3 text-sm"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-indigo-300">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{wallet.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {wallet.chainNamespace}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ProgressiveData>
        </ProfileSection>
      </div>

      <div className="space-y-6">
        <ProfileSection title="Current Status">
          <div className="space-y-4 text-sm">
            <ProgressiveData
              title="Wallet verification"
              state={identity.wallets.state}
              data={identity.wallets.data}
              message={identity.wallets.message}
            >
              {(data) => (
                <p>
                  {data.verifiedWalletCount} verified wallet
                  {data.verifiedWalletCount === 1 ? "" : "s"}
                </p>
              )}
            </ProgressiveData>

            <ProgressiveData
              title="Inventory freshness"
              state={identity.inventory.state}
              data={identity.inventory.data}
              lastUpdatedAt={identity.inventory.lastUpdatedAt}
              message={identity.inventory.message}
            >
              {(data) => (
                <p className="capitalize">{data.inventoryStatus}</p>
              )}
            </ProgressiveData>

            <ProgressiveData
              title="Collector Score"
              state={identity.statusModules.collectorScore.state}
              data={identity.statusModules.collectorScore.data}
              message={identity.statusModules.collectorScore.message}
            >
              {() => null}
            </ProgressiveData>

            <ProgressiveData
              title="Communities"
              state={identity.statusModules.communities.state}
              data={identity.statusModules.communities.data}
              message={identity.statusModules.communities.message}
            >
              {() => null}
            </ProgressiveData>
          </div>
        </ProfileSection>

        <ProfileSection title="Identity">
          <ProgressiveData
            state={identity.identity.state}
            data={identity.identity.data}
            message={identity.identity.message}
          >
            {(data) => (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Display name
                  </dt>
                  <dd>{data.displayName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Profile ID
                  </dt>
                  <dd className="truncate font-mono text-xs">{data.profileId}</dd>
                </div>
              </dl>
            )}
          </ProgressiveData>
        </ProfileSection>

        <ProfileSection title="Badges">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Award className="h-4 w-4" />
            Coming Soon
          </div>
        </ProfileSection>
      </div>
    </div>
  );
}
