"use client";

import {
  BadgeCheck,
  CalendarDays,
  Globe,
  Link as LinkIcon,
  MapPin,
  Sparkles,
} from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { LockedCard } from "@/components/auth/locked-card";
import { ProfileSection, TagChips } from "@/components/profile/ui";

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="truncate text-sm">{value}</div>
      </div>
    </div>
  );
}

export default function BioPage() {
  const { profile, viewerAuthenticated } = useProfile();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main column */}
      <div className="space-y-6 lg:col-span-2">
        <ProfileSection title="About">
          <p className="text-sm leading-relaxed text-foreground/90">
            {profile.fullBio}
          </p>
        </ProfileSection>

        <ProfileSection title="Collector Story">
          <p className="text-sm leading-relaxed text-foreground/90">
            {profile.collectorStory}
          </p>
        </ProfileSection>

        <ProfileSection title="Badges">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Main badge
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-300">
                <BadgeCheck className="h-4 w-4" />
                {profile.mainBadge}
              </span>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Secondary badges
              </p>
              <TagChips items={profile.secondaryBadges} />
            </div>
          </div>
        </ProfileSection>

        {viewerAuthenticated ? (
          <ProfileSection title="Recent Point Activity">
            <ul className="divide-y divide-white/5">
              {profile.recentPointActivity.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm">{activity.label}</p>
                      <p className="text-xs text-muted-foreground">{activity.when}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">
                    +{activity.points}
                  </span>
                </li>
              ))}
            </ul>
          </ProfileSection>
        ) : (
          <LockedCard
            title="Community reputation & point history"
            description="Log in to see this collector's point history, community reputation, and detailed badge activity."
            cta="Log in to view more"
            items={[
              "Recent point activity",
              "Community reputation",
              "Detailed badge history",
            ]}
          />
        )}
      </div>

      {/* Side column */}
      <div className="space-y-6">
        <ProfileSection title="Details">
          <div className="divide-y divide-white/5">
            <DetailRow
              icon={CalendarDays}
              label="Member since"
              value={profile.memberSince}
            />
            {profile.location && (
              <DetailRow icon={MapPin} label="Location" value={profile.location} />
            )}
            {profile.website && (
              <DetailRow
                icon={Globe}
                label="Website"
                value={
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-300 hover:underline"
                  >
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                }
              />
            )}
            {profile.socials.map((social) => (
              <DetailRow
                key={social.platform}
                icon={LinkIcon}
                label={social.platform}
                value={social.handle}
              />
            ))}
          </div>
        </ProfileSection>

        <ProfileSection title="Profile Completion">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Complete</span>
            <span className="font-semibold">{profile.profileCompletion}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300"
              style={{ width: `${profile.profileCompletion}%` }}
            />
          </div>
        </ProfileSection>

        <ProfileSection title="Collector Style">
          <TagChips items={[profile.collectorStyle]} />
        </ProfileSection>

        <ProfileSection title="Collector Interests">
          <TagChips items={profile.interests} />
        </ProfileSection>

        <ProfileSection title="Favorite Collections">
          <TagChips items={profile.favoriteCollections} />
        </ProfileSection>

        <ProfileSection title="Favorite Chains">
          <TagChips items={profile.favoriteChains} />
        </ProfileSection>
      </div>
    </div>
  );
}
