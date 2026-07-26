import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";

export const NO_VERIFIED_WALLETS_TITLE =
  "Verify your wallet to build your Collector Identity";

export const NO_VERIFIED_WALLETS_DESCRIPTION =
  "Prove ownership of your connected wallet, then synchronize your collectibles.";

/**
 * True when the authenticated identity has no verified wallets yet.
 * Inventory/collection empty messages in that case are redundant — use the
 * single intentional empty state instead.
 */
export function hasNoVerifiedWallets(
  identity: CollectorIdentityResponse | null | undefined
): boolean {
  if (!identity) return false;
  if (identity.wallets.state !== "empty") return false;
  return (
    identity.wallets.data == null ||
    identity.wallets.data.verifiedWalletCount === 0
  );
}
