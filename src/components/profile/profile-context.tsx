"use client";

import { createContext, useContext, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";

import { deriveUsername, type Profile } from "@/lib/profile/data";

type ProfileContextValue = {
  profile: Profile;
  /** True when the authenticated user is viewing their own profile. */
  isOwner: boolean;
  /** True when financial values should be shown to the current viewer. */
  canViewFinancials: boolean;
  /** True when the collection contents should be shown to the current viewer. */
  canViewCollection: boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const { ready, authenticated, user } = usePrivy();

  const isOwner = useMemo(() => {
    if (!ready || !authenticated || !user) return false;
    return deriveUsername(user).toLowerCase() === profile.username.toLowerCase();
  }, [ready, authenticated, user, profile.username]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      isOwner,
      canViewFinancials: isOwner || profile.privacy.showFinancials,
      canViewCollection: isOwner || profile.privacy.showCollection,
    }),
    [profile, isOwner]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
