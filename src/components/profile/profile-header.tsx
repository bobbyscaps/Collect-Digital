"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Coins,
  Gauge,
  Pencil,
  TrendingUp,
  UserPlus,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProfile } from "./profile-context";

function HeaderStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
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

export function ProfileHeader() {
  const { profile, isOwner } = useProfile();
  const [following, setFollowing] = useState(false);

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
            <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-2xl font-bold text-white shadow-xl shadow-indigo-500/30 ring-4 ring-background sm:-mt-14 sm:h-28 sm:w-28">
              {profile.initials}
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {profile.displayName}
                </h1>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-300"
                  title="Main badge"
                >
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {profile.mainBadge}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isOwner ? (
              <Button asChild variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10">
                <Link href={`/profile/${profile.username}/settings`}>
                  <Pencil />
                  Edit Profile
                </Link>
              </Button>
            ) : (
              <Button
                variant={following ? "outline" : "default"}
                className={following ? "border-white/15 bg-white/5 hover:bg-white/10" : ""}
                onClick={() => setFollowing((prev) => !prev)}
              >
                {following ? <UserCheck /> : <UserPlus />}
                {following ? "Following" : "Follow"}
              </Button>
            )}
          </div>
        </div>

        {/* Bio summary */}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {profile.bioSummary}
        </p>

        {/* Followers */}
        <div className="mt-3 flex gap-4 text-sm">
          <span>
            <span className="font-semibold">{profile.followers.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">Followers</span>
          </span>
          <span>
            <span className="font-semibold">{profile.following.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">Following</span>
          </span>
        </div>

        {/* Key stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HeaderStat icon={Gauge} label="Collector Score" value={profile.collectorScore} />
          <HeaderStat icon={TrendingUp} label="Flipper Score" value={profile.flipperScore} />
          <HeaderStat icon={BadgeCheck} label="Main Badge" value={profile.mainBadge} />
          <HeaderStat
            icon={Coins}
            label="Collect Points"
            value={profile.collectPoints.toLocaleString()}
          />
        </div>
      </div>
    </div>
  );
}
