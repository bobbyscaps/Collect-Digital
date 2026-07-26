import { handleCreateVerificationChallenge } from "@/lib/wallet-verification-flow/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallets/verification/challenge
 *
 * Creates a short-lived, single-use ownership challenge with a canonical
 * Collect Digital verification message for the authenticated profile's wallet.
 */
export async function POST(request: Request) {
  return handleCreateVerificationChallenge(request);
}
