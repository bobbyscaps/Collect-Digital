"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";

import {
  fetchMyCollectorIdentity,
  CollectorIdentityClientError,
} from "@/lib/collector-identity/client";
import {
  loadingSection,
  type CollectorIdentityCollectionSummaryData,
  type CollectorIdentityIdentityData,
  type CollectorIdentityInventoryData,
  type CollectorIdentityResponse,
  type CollectorIdentityWalletsData,
} from "@/lib/collector-identity/api-models";
import { deriveUsername } from "@/lib/profile/data";

export type CollectorIdentityViewModel = {
  username: string;
  /** Initials for avatar chrome when no avatarUrl is available. */
  initials: string;
  /** Route/display username — not a fabricated metric. */
  displayLabel: string;
};

type ProfileContextValue = {
  username: string;
  view: CollectorIdentityViewModel;
  /** True when the authenticated user is viewing their own profile. */
  isOwner: boolean;
  /** True when the viewer is logged in (any account). */
  viewerAuthenticated: boolean;
  /** Authenticated owner's Collector Identity payload (null until loaded / non-owner). */
  identity: CollectorIdentityResponse | null;
  identityLoading: boolean;
  identityError: string | null;
  refreshIdentity: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function toInitials(label: string): string {
  const parts = label.replace(/^@/, "").split(/[\s-_]+/).filter(Boolean);
  if (parts.length === 0) return "CD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function loadingIdentity(profileId: string): CollectorIdentityResponse {
  return {
    schemaVersion: 1,
    profileId,
    identity: loadingSection<CollectorIdentityIdentityData>(),
    wallets: loadingSection<CollectorIdentityWalletsData>(),
    inventory: loadingSection<CollectorIdentityInventoryData>(),
    collectionSummaries:
      loadingSection<readonly CollectorIdentityCollectionSummaryData[]>(),
    statusModules: {
      collectorScore: loadingSection<null>(),
      collectionScores: loadingSection<null>(),
      communities: loadingSection<null>(),
      followers: loadingSection<null>(),
      following: loadingSection<null>(),
    },
    achievements: loadingSection<null>(),
  };
}

export function ProfileProvider({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [identity, setIdentity] = useState<CollectorIdentityResponse | null>(
    null
  );
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const normalizedUsername = username.trim().toLowerCase() || "collector";

  const isOwner = useMemo(() => {
    if (!ready || !authenticated || !user) return false;
    return deriveUsername(user).toLowerCase() === normalizedUsername;
  }, [ready, authenticated, user, normalizedUsername]);

  const viewerAuthenticated = ready ? authenticated : false;

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (!ready) return;

      if (!isOwner || !authenticated) {
        setIdentity(null);
        setIdentityLoading(false);
        setIdentityError(null);
        return;
      }

      setIdentityLoading(true);
      setIdentityError(null);
      setIdentity(loadingIdentity("me"));

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new CollectorIdentityClientError("Authentication required.", {
            status: 401,
            code: "authentication_required",
          });
        }
        const result = await fetchMyCollectorIdentity({ accessToken });
        if (!cancelled) {
          setIdentity(result);
          setIdentityError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setIdentity(null);
          setIdentityError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Collector Identity."
          );
        }
      } finally {
        if (!cancelled) setIdentityLoading(false);
      }
    }

    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    isOwner,
    authenticated,
    getAccessToken,
    refreshKey,
  ]);

  const displayName =
    identity?.identity.data?.displayName?.trim() ||
    normalizedUsername;
  const view = useMemo<CollectorIdentityViewModel>(
    () => ({
      username: normalizedUsername,
      displayLabel: displayName,
      initials: toInitials(displayName),
    }),
    [normalizedUsername, displayName]
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      username: normalizedUsername,
      view,
      isOwner,
      viewerAuthenticated,
      identity,
      identityLoading,
      identityError,
      refreshIdentity: () => setRefreshKey((key) => key + 1),
    }),
    [
      normalizedUsername,
      view,
      isOwner,
      viewerAuthenticated,
      identity,
      identityLoading,
      identityError,
    ]
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
