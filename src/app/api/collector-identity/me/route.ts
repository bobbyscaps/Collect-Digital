import { handleGetCollectorIdentityMe } from "@/lib/collector-identity/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/collector-identity/me
 *
 * Authenticated Collector Identity. profileId is derived only from the verified
 * Privy access token — never from client-supplied identifiers.
 */
export async function GET(request: Request) {
  return handleGetCollectorIdentityMe(request);
}
