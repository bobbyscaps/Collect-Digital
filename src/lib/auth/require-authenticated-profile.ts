import { verifyPrivyToken } from "@/lib/admin/verify";
import {
  createAuthenticatedProfileContext,
  type AuthenticatedProfileContext,
} from "@/lib/wallet-verification/auth-context";
import { resolveOrCreateProfileForPrivyUser } from "@/lib/profiles/resolve-profile";
import type { ProfileRepository } from "@/lib/profiles/repository";
import {
  USER_FACING_SERVICE_UNAVAILABLE,
  isInfrastructureErrorMessage,
  logTechnicalError,
} from "@/lib/errors/user-facing";

/** Re-export the canonical Privy → internal UUID resolver. */
export { resolveProfileIdFromPrivyUserId } from "@/lib/profiles/resolve-profile";

export type AuthenticatedProfileResult =
  | {
      ok: true;
      /** External Privy JWT subject (did:privy:...). Never a DB foreign key. */
      privyUserId: string;
      /** Trusted context whose profileId is the internal Collect Digital UUID. */
      auth: AuthenticatedProfileContext;
    }
  | {
      ok: false;
      status: number;
      message: string;
      code:
        | "authentication_required"
        | "invalid_token"
        | "service_unavailable"
        | "internal_error";
    };

export type RequireAuthenticatedProfileOptions = {
  /** Injectable profile repository for tests. Defaults to Supabase. */
  profiles?: ProfileRepository;
};

/**
 * Verifies the Bearer Privy access token and builds a trusted profile context.
 *
 * Flow:
 *   Privy JWT sub → profiles mapping → internal UUID → AuthenticatedProfileContext
 *
 * Never reads profileId from query/body/path. Client-supplied profile IDs are ignored.
 */
export async function requireAuthenticatedProfile(
  request: Request,
  options: RequireAuthenticatedProfileOptions = {}
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

  try {
    const profile = await resolveOrCreateProfileForPrivyUser(
      privyUserId,
      options.profiles
    );
    return {
      ok: true,
      privyUserId,
      auth: createAuthenticatedProfileContext(profile.id),
    };
  } catch (cause) {
    logTechnicalError("requireAuthenticatedProfile profile resolution", cause);
    const technical =
      cause instanceof Error ? cause.message : "Profile resolution failed.";
    if (isInfrastructureErrorMessage(technical)) {
      return {
        ok: false,
        status: 503,
        message: USER_FACING_SERVICE_UNAVAILABLE,
        code: "service_unavailable",
      };
    }
    return {
      ok: false,
      status: 500,
      message: "Unable to resolve collector profile.",
      code: "internal_error",
    };
  }
}
