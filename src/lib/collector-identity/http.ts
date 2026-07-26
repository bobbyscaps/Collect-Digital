import { NextResponse } from "next/server";

import { requireAuthenticatedProfile } from "@/lib/auth/require-authenticated-profile";
import type { CollectorIdentityService } from "@/lib/collector-identity/compose";
import type { CollectorIdentityErrorResponse } from "@/lib/collector-identity/api-models";
import { createDefaultCollectorIdentityService } from "@/lib/collector-identity/wiring";
import {
  USER_FACING_IDENTITY_UNAVAILABLE,
  USER_FACING_INTERNAL_ERROR,
  isInfrastructureErrorMessage,
  logTechnicalError,
  toUserFacingErrorMessage,
} from "@/lib/errors/user-facing";

export type CollectorIdentityRouteDependencies = {
  identityService?: CollectorIdentityService;
  requireAuth?: typeof requireAuthenticatedProfile;
};

function errorResponse(
  status: number,
  code: CollectorIdentityErrorResponse["error"]["code"],
  message: string
) {
  const body: CollectorIdentityErrorResponse = {
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}

/**
 * Testable handler for GET /api/collector-identity/me.
 *
 * profileId is the internal Collect Digital UUID resolved from the verified
 * Privy JWT subject via the profiles mapping — never a client-supplied ID and
 * never the raw Privy DID as a foreign key. Repositories are never exposed.
 */
export async function handleGetCollectorIdentityMe(
  request: Request,
  dependencies: CollectorIdentityRouteDependencies = {}
) {
  const requireAuth = dependencies.requireAuth ?? requireAuthenticatedProfile;
  const authResult = await requireAuth(request);

  if (!authResult.ok) {
    return errorResponse(authResult.status, authResult.code, authResult.message);
  }

  try {
    const identityService =
      dependencies.identityService ?? createDefaultCollectorIdentityService();
    const identity = await identityService.getMyIdentity(authResult.auth);
    return NextResponse.json(identity);
  } catch (cause) {
    logTechnicalError("collector-identity/me", cause);
    const technical =
      cause instanceof Error ? cause.message : "Collector Identity unavailable.";
    if (
      isInfrastructureErrorMessage(technical) ||
      technical.includes("SUPABASE")
    ) {
      return errorResponse(
        503,
        "service_unavailable",
        USER_FACING_IDENTITY_UNAVAILABLE
      );
    }
    return errorResponse(
      500,
      "internal_error",
      toUserFacingErrorMessage(cause, USER_FACING_INTERNAL_ERROR)
    );
  }
}
