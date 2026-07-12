"use client";

import {
  Bell,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  ShieldAlert,
  UserCircle2,
  Wallet,
} from "lucide-react";

import { useProfile } from "@/components/profile/profile-context";
import { EmptyState, ProfileSection } from "@/components/profile/ui";
import { Button } from "@/components/ui/button";

function SettingRow({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-white/15 bg-white/5 hover:bg-white/10"
      >
        {action}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const { isOwner } = useProfile();

  if (!isOwner) {
    return (
      <ProfileSection title="About / Settings">
        <EmptyState
          icon={ShieldAlert}
          title="Settings are private"
          description="Only the profile owner can view and edit these settings."
        />
      </ProfileSection>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileSection title="Profile">
        <div className="divide-y divide-white/5">
          <SettingRow
            icon={UserCircle2}
            title="Edit bio"
            description="Update your display name, bio summary, full bio, and collector story."
            action="Edit"
          />
          <SettingRow
            icon={ImageIcon}
            title="Upload banner"
            description="Set a custom banner image for your profile header."
            action="Upload"
          />
          <SettingRow
            icon={ImageIcon}
            title="Change PFP"
            description="Upload a new profile picture, or select an NFT you own as your PFP."
            action="Change"
          />
          <SettingRow
            icon={RefreshCw}
            title="Showcase rotation"
            description="Choose manual or automatic rotation for your featured NFTs."
            action="Configure"
          />
        </div>
      </ProfileSection>

      <ProfileSection title="Privacy">
        <div className="divide-y divide-white/5">
          <SettingRow
            icon={Lock}
            title="Privacy settings"
            description="Control who can see your collection and financial values."
            action="Manage"
          />
          <SettingRow
            icon={Bell}
            title="Notification preferences"
            description="Choose which activity and community updates you receive."
            action="Manage"
          />
        </div>
      </ProfileSection>

      <ProfileSection title="Connections">
        <div className="divide-y divide-white/5">
          <SettingRow
            icon={UserCircle2}
            title="Connected accounts"
            description="Link or unlink your X, Google, and Apple accounts."
            action="Manage"
          />
          <SettingRow
            icon={Wallet}
            title="Connected wallets"
            description="Add or remove the wallets linked to your collector profile."
            action="Manage"
          />
        </div>
      </ProfileSection>
    </div>
  );
}
