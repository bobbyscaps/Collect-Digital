import { WalletProfileMismatchError } from "@/lib/wallet-verification/domain";

/**
 * Trusted authentication context for wallet verification.
 *
 * HTTP handlers must construct this only from verified server-side auth:
 * Privy JWT subject → profiles mapping → internal Collect Digital UUID.
 *
 * `profileId` is always the internal UUID (`profiles.id`), never the Privy DID.
 * Never build this object from an untrusted client-supplied profileId alone.
 */
export interface AuthenticatedProfileContext {
  /** Internal Collect Digital profile UUID (`profiles.id`). */
  readonly profileId: string;
}

export function createAuthenticatedProfileContext(
  authenticatedProfileId: string
): AuthenticatedProfileContext {
  const profileId = authenticatedProfileId.trim();
  if (!profileId) {
    throw new WalletProfileMismatchError(
      "Authenticated profileId is required from server-side auth context."
    );
  }
  return Object.freeze({ profileId });
}

/**
 * Binds an optional client-claimed profileId to the trusted auth profile.
 * Mismatches are rejected; the trusted auth value always wins as the source.
 */
export function resolveTrustedProfileId(input: {
  auth: AuthenticatedProfileContext;
  claimedProfileId?: string;
}): string {
  const trusted = input.auth.profileId;
  if (
    input.claimedProfileId != null &&
    input.claimedProfileId.trim() !== trusted
  ) {
    throw new WalletProfileMismatchError(
      "Claimed profileId does not match authenticated profile."
    );
  }
  return trusted;
}
