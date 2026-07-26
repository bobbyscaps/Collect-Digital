import { handleSyncWalletInventory } from "@/lib/wallet-verification-flow/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallets/inventory/sync
 *
 * Retries inventory synchronization for an already-verified wallet owned by
 * the authenticated profile. Does not alter verification status.
 */
export async function POST(request: Request) {
  return handleSyncWalletInventory(request);
}
