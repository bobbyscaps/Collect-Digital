"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Clock3,
  Layers,
  Pencil,
  ShieldCheck,
  Wallet,
  UserPlus,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGatedLogin } from "@/components/auth/gated-login";
import { ProgressiveData } from "@/components/collector-identity/progressive-data";
import { useProfile } from "./profile-context";

function HeaderStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function formatSync(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ProfileHeader() {
  const {
    view,
    isOwner,
    viewerAuthenticated,
    identity,
    identityLoading,
    identityError,
  } = useProfile();
  const { requireLogin } = useGatedLogin();
  const [following, setFollowing] = useState(false);

  const handleFollow = () => {
    if (!viewerAuthenticated) {
      requireLogin();
      return;
    }
    // Follow graph is not implemented — do not invent follower counts.
    setFollowing((prev) => !prev);
  };

  const identityData = identity?.identity.data;
  const avatarUrl = identityData?.avatarUrl ?? null;
  const bio = identityData?.bio?.trim() || null;
  const verifiedCount = identity?.wallets.data?.verifiedWalletCount ?? null;
  const hasVerifiedWallet =
    typeof verifiedCount === "number" ? verifiedCount > 0 : false;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {/* Banner */}
      <div className="relative h-36 w-full bg-gradient-to-br from-violet-600/40 via-indigo-600/30 to-sky-500/30 sm:h-52">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_40%)]" />
      </div>

      <div className="px-5 pb-5 sm:px-7 sm:pb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            {/* Avatar */}
            <div className="relative -mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-2xl font-bold text-white shadow-xl shadow-indigo-500/30 ring-4 ring-background sm:-mt-14 sm:h-28 sm:w-28">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- optional remote avatar URLs are not in next/image remotePatterns
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {view.initials}
                </div>
              )}
            </div>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {identityData?.displayName?.trim() || view.displayLabel}
                </h1>
                {hasVerifiedWallet && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300"
                    title="Verified wallet"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{view.username}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isOwner ? (
              <Button
                asChild
                variant="outline"
                className="border-white/15 bg-white/5 hover:bg-white/10"
              >
                <Link href={`/profile/${view.username}/settings`}>
                  <Pencil />
                  Edit Profile
                </Link>
              </Button>
            ) : (
              <Button
                variant={following ? "outline" : "default"}
                className={
                  following ? "border-white/15 bg-white/5 hover:bg-white/10" : ""
                }
                onClick={handleFollow}
              >
                {following ? <UserCheck /> : <UserPlus />}
                {following ? "Following" : "Follow"}
              </Button>
            )}
          </div>
        </div>

        {/* Bio — only when real */}
        {bio ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {bio}
          </p>
        ) : (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {isOwner
              ? identityLoading
                ? "Loading Collector Identity…"
                : "No bio yet."
              : viewerAuthenticated
                ? "Collector Identity details are available on your own profile."
                : "Log in to load your Collector Identity."}
          </p>
        )}

        {/* Public social counts intentionally omitted — not backed by real data. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Followers · Coming Soon</span>
          <span>Following · Coming Soon</span>
          <span>Communities · Coming Soon</span>
        </div>

        {/* Key stats — real inventory / wallet signals only */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <HeaderStat
            icon={Wallet}
            label="Verified Wallets"
            value={
              identityLoading
                ? "…"
                : verifiedCount != null
                  ? verifiedCount
                  : isOwner
                    ? "—"
                    : "—"
            }
          />
          <HeaderStat
            icon={Layers}
            label="Collections"
            value={
              identityLoading
                ? "…"
                : (identity?.inventory.data?.totalCollections ?? "—")
            }
          />
          <HeaderStat
            icon={Boxes}
            label="Unique Tokens"
            value={
              identityLoading
                ? "…"
                : (identity?.inventory.data?.uniqueTokenCount ?? "—")
            }
          />
          <HeaderStat
            icon={ShieldCheck}
            label="Inventory Status"
            value={
              identityLoading
                ? "…"
                : identity?.inventory.state === "stale"
                  ? "Stale"
                  : (identity?.inventory.data?.inventoryStatus ??
                    identity?.inventory.state ??
                    "—")
            }
          />
          <HeaderStat
            icon={Clock3}
            label="Latest Sync"
            value={
              identityLoading
                ? "…"
                : formatSync(
                    identity?.inventory.lastUpdatedAt ??
                      identity?.wallets.data?.latestSuccessfulSync
                  )
            }
          />
        </div>

        {isOwner && (
          <div className="mt-4 space-y-3">
            {identityError && (
              <p className="text-xs text-rose-200/90">{identityError}</p>
            )}
            {identity &&
              identity.inventory.state !== "live" &&
              identity.inventory.state !== "loading" && (
                <ProgressiveData
                  state={identity.inventory.state}
                  data={identity.inventory.data}
                  lastUpdatedAt={identity.inventory.lastUpdatedAt}
                  message={identity.inventory.message}
                />
              )}
          </div>
        )}

        {!isOwner && (
          <p className="mt-3 text-xs text-muted-foreground">
            Live Collector Identity metrics are shown for your authenticated
            profile only. Unsupported modules display Coming Soon — never sample
            scores.
          </p>
        )}
      </div>
    </div>
  );
}
