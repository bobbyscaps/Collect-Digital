import { createRemoteJWKSet, jwtVerify } from "jose";

import { getAdminAllowlist, isOpenInDev } from "@/lib/admin/allowlist";

const PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmrhzu3qu002z0cl4rc1tf36v";

// Privy publishes a public JWKS per app; verifying against it needs only the
// public app id (no Privy secret required).
const JWKS = createRemoteJWKSet(
  new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
);

/** Verify a Privy access token and return the user id (DID), or null. */
export async function verifyPrivyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "privy.io",
      audience: PRIVY_APP_ID,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

type AdminCheck =
  | { ok: true; userId: string | null }
  | { ok: false; status: number; message: string };

/**
 * Server-side guard for admin write actions. Verifies the bearer token (if any)
 * and enforces the allowlist. Falls open only in development when no allowlist
 * is configured; fails closed in production.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token ? await verifyPrivyToken(token) : null;

  const allowlist = getAdminAllowlist();

  if (allowlist.length === 0) {
    if (isOpenInDev()) {
      return { ok: true, userId };
    }
    return {
      ok: false,
      status: 403,
      message: "Admin allowlist is not configured.",
    };
  }

  if (userId && allowlist.includes(userId)) {
    return { ok: true, userId };
  }

  return userId
    ? { ok: false, status: 403, message: "Not authorized." }
    : { ok: false, status: 401, message: "Authentication required." };
}
