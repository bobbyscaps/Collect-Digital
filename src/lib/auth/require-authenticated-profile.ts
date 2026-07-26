import { verifyPrivyToken } from "@/lib/admin/verify";
import {
  createAuthenticatedProfileContext,
  type AuthenticatedProfileContext,
} from "@/lib/wallet-verification/auth-context";

/**
 * Maps a verified Privy subject to the Collect Digital profileId.
 *
 * The trusted JWT `sub` is the only source of profile identity for authenticated
 * routes. Client-supplied profile IDs are never accepted.
 *
 * Until a dedicated Privy↔profile mapping table exists, the verified subject is
 * used directly as the profile key (same contract as AuthenticatedProfileContext).
 */
export function resolveProfileIdFromPrivyUserId(privyUserId: string): string {
  const trimmed = privyUserId.trim();
  if (!trimmed) {
    throw new Error("Privy user id is required to resolve profileId.");
  }
  return trimmed;
}

export type AuthenticatedProfileResult =
  | {
      ok: true;
      privyUserId: string;
      auth: AuthenticatedProfileContext;
    }
  | {
      ok: false;
      status: number;
      message: string;
      code: "authentication_required" | "invalid_token";
    };

/**
 * Verifies the Bearer Privy access token and builds a trusted profile context.
 * Never reads profileId from query/body/path.
 */
export async function requireAuthenticatedProfile(
  request: Request
): Promise<AuthenticatedProfileResult> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Authentication required.",
      code: "authentication_required",
    };
  }

  const privyUserId = await verifyPrivyToken(token);
  if (!privyUserId) {
    return {
      ok: false,
      status: 401,
      message: "Invalid or expired authentication token.",
      code: "invalid_token",
    };
  }

  const profileId = resolveProfileIdFromPrivyUserId(privyUserId);
  return {
    ok: true,
    privyUserId,
    auth: createAuthenticatedProfileContext(profileId),
  };
}
