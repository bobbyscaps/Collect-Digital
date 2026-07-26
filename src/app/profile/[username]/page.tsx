"use client";

import { Award, Wallet } from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import {
  hasNoVerifiedWallets,
  hasVerifiedCollectorIdentity,
  isWalletRegistryUnavailable,
} from "@/components/collector-identity/no-verified-wallets";
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
        <ProgressiveData state="loading" data={null} />
      </ProfileSection>
    );
  }

  if (identityError && !identity) {
    return (
      <ProfileSection title="Collector Identity">
        <ProgressiveData state="error" data={null} message={identityError} />
      </ProfileSection>
    );
  }

  if (!identity) {
    return (
      <ProfileSection title="Collector Identity">
        <ProgressiveData
          state="empty"
          data={null}
          message="No identity loaded."
        />
      </ProfileSection>
    );
  }

  const noVerifiedWallets = hasNoVerifiedWallets(identity);
  const registryUnavailable = isWalletRegistryUnavailable(identity);
  const showCollectorScore = hasVerifiedCollectorIdentity(identity);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <ProfileSection title="About">
          <ProgressiveData
            state={identity.identity.data?.bio ? identity.identity.state : "empty"}
            data={identity.identity.data}
            message={
              identity.identity.data?.bio
                ? identity.identity.message
                : "No bio yet."
            }
            render={(data) => (
              <p className="text-sm leading-relaxed text-foreground/90">
                {data?.bio}
              </p>
            )}
          />
        </ProfileSection>

        <ProfileSection
          title="Achievements"
          description="Permanent badges earned once and kept in collector history."
        >
          <ProgressiveData
            state={identity.achievements.state}
            data={identity.achievements.data}
            message={identity.achievements.message}
          />
        </ProfileSection>

        {registryUnavailable && (
          <ProfileSection title="Verified Wallets">
            <ProgressiveData
              state="error"
              data={null}
              message={
                identity.wallets.message ??
                "Wallet verification is temporarily unavailable. Please try again shortly."
              }
            />
          </ProfileSection>
        )}

        {!noVerifiedWallets && !registryUnavailable && (
          <ProfileSection title="Verified Wallets">
            <ProgressiveData
              state={identity.wallets.state}
              data={identity.wallets.data}
              lastUpdatedAt={identity.wallets.lastUpdatedAt}
              message={identity.wallets.message}
              render={(data) => (
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
            />
          </ProfileSection>
        )}
      </div>

      <div className="space-y-6">
        <ProfileSection title="Current Status">
          <div className="space-y-4 text-sm">
            {registryUnavailable && (
              <ProgressiveData
                title="Wallet verification"
                state="error"
                data={null}
                message={
                  identity.wallets.message ??
                  "Wallet verification is temporarily unavailable. Please try again shortly."
                }
              />
            )}

            {!noVerifiedWallets && !registryUnavailable && (
              <>
                <ProgressiveData
                  title="Wallet verification"
                  state={identity.wallets.state}
                  data={identity.wallets.data}
                  message={identity.wallets.message}
                  render={(data) => (
                    <p>
                      {data.verifiedWalletCount} verified wallet
                      {data.verifiedWalletCount === 1 ? "" : "s"}
                    </p>
                  )}
                />

                <ProgressiveData
                  title="Inventory freshness"
                  state={identity.inventory.state}
                  data={identity.inventory.data}
                  lastUpdatedAt={identity.inventory.lastUpdatedAt}
                  message={identity.inventory.message}
                  render={(data) => (
                    <p className="capitalize">{data.inventoryStatus}</p>
                  )}
                />
              </>
            )}

            {showCollectorScore && (
              <ProgressiveData
                title="Collector Score"
                state={identity.statusModules.collectorScore.state}
                data={identity.statusModules.collectorScore.data}
                message={identity.statusModules.collectorScore.message}
              />
            )}

            <ProgressiveData
              title="Communities"
              state={identity.statusModules.communities.state}
              data={identity.statusModules.communities.data}
              message={identity.statusModules.communities.message}
            />
          </div>
        </ProfileSection>

        <ProfileSection title="Identity">
          <ProgressiveData
            state={identity.identity.state}
            data={identity.identity.data}
            message={identity.identity.message}
            render={(data) => (
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
          />
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
