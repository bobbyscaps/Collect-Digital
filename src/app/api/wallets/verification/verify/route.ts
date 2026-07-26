import { handleVerifyWalletOwnership } from "@/lib/wallet-verification-flow/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallets/verification/verify
 *
 * Verifies a wallet ownership signature (PR4). First inventory sync is a
 * separate POST /api/wallets/inventory/sync call so outcomes stay independent.
 */
export async function POST(request: Request) {
  return handleVerifyWalletOwnership(request);
}
