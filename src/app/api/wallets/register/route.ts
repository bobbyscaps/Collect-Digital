import { handleRegisterWallet } from "@/lib/wallet-verification-flow/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/wallets/register
 *
 * Authenticated wallet registration. profileId is derived only from the verified
 * Privy access token. Does not mark the wallet verified.
 */
export async function POST(request: Request) {
  return handleRegisterWallet(request);
}
