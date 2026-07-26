import { NextResponse } from "next/server";

import { requireAuthenticatedProfile } from "@/lib/auth/require-authenticated-profile";
import type { CollectorIdentityService } from "@/lib/collector-identity/compose";
import type { CollectorIdentityErrorResponse } from "@/lib/collector-identity/api-models";
import { createDefaultCollectorIdentityService } from "@/lib/collector-identity/wiring";

export const dynamic = "force-dynamic";

type RouteDependencies = {
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
 * profileId is derived only from the verified Privy access token — never from
 * client-supplied identifiers. Repositories and provider models are never exposed.
 */
export async function handleGetCollectorIdentityMe(
  request: Request,
  dependencies: RouteDependencies = {}
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
    const message =
      cause instanceof Error ? cause.message : "Collector Identity unavailable.";
    if (
      message.includes("Supabase admin client unavailable") ||
      message.includes("SUPABASE")
    ) {
      return errorResponse(503, "service_unavailable", message);
    }
    return errorResponse(500, "internal_error", message);
  }
}

export async function GET(request: Request) {
  return handleGetCollectorIdentityMe(request);
}
