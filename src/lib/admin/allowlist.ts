/**
 * Admin allowlist shared by the client gate and the server-side write guard.
 *
 * Admins are identified by their Privy user ID (DID, e.g. "did:privy:...").
 * Set NEXT_PUBLIC_ADMIN_ALLOWLIST to a comma-separated list of DIDs. It uses the
 * NEXT_PUBLIC_ prefix on purpose — the list of admins is not a secret; the actual
 * protection comes from verifying the Privy access token server-side.
 *
 * Behavior when the allowlist is empty:
 *   - development: open (so the Score Lab is usable locally without setup)
 *   - production: locked (fail closed)
 */
export function getAdminAllowlist(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isAllowlistConfigured(): boolean {
  return getAdminAllowlist().length > 0;
}

/** When no allowlist is configured, allow in dev, deny in prod. */
export function isOpenInDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  const allowlist = getAdminAllowlist();
  if (allowlist.length === 0) {
    return isOpenInDev();
  }
  return Boolean(userId) && allowlist.includes(userId as string);
}
