import { createClient } from "@supabase/supabase-js";

import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type {
  ProfileWalletRole,
  ProfileWalletVerificationStatus,
  WalletChainNamespace,
} from "@/lib/profile-wallets/domain";
import { env } from "@/lib/env";
import {
  ChallengeNotFoundError,
  ConsumedChallengeError,
  ExpiredChallengeError,
  VerificationWalletNotFoundError,
  type WalletVerificationChallenge,
} from "@/lib/wallet-verification/domain";
import type {
  CompleteWalletVerification,
  CompleteWalletVerificationInput,
  CompleteWalletVerificationResult,
} from "@/lib/wallet-verification/completion";

interface ChallengeRow {
  id: string;
  profile_id: string;
  wallet_id: string;
  nonce: string;
  chain_namespace: WalletChainNamespace;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

interface WalletRow {
  id: string;
  profile_id: string;
  chain_namespace: WalletChainNamespace;
  address: string;
  normalized_address: string;
  role: ProfileWalletRole;
  verification_status: ProfileWalletVerificationStatus;
  verified_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RpcPayload {
  challenge: ChallengeRow;
  wallet: WalletRow;
}

function getAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function requireClient() {
  const client = getAdminClient();
  if (!client) {
    throw new Error(
      "Supabase admin client unavailable for atomic wallet verification."
    );
  }
  return client;
}

function mapChallenge(row: ChallengeRow): WalletVerificationChallenge {
  return {
    id: row.id,
    profileId: row.profile_id,
    walletId: row.wallet_id,
    nonce: row.nonce,
    chainNamespace: row.chain_namespace,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

function mapWallet(row: WalletRow): ProfileWallet {
  return {
    id: row.id,
    profileId: row.profile_id,
    chainNamespace: row.chain_namespace,
    address: row.address,
    normalizedAddress: row.normalized_address,
    role: row.role,
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    disconnectedAt: row.disconnected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRpcError(error: { message?: string | null; code?: string | null }): never {
  const message = error.message ?? "Atomic wallet verification failed.";
  if (message.includes("consumed_challenge")) {
    throw new ConsumedChallengeError(message);
  }
  if (message.includes("expired_challenge")) {
    throw new ExpiredChallengeError(message);
  }
  if (message.includes("wallet_not_found")) {
    throw new VerificationWalletNotFoundError(message);
  }
  if (message.includes("challenge_not_found")) {
    throw new ChallengeNotFoundError(message);
  }
  throw new Error(message);
}

/**
 * Calls Postgres RPC `complete_wallet_ownership_verification` so challenge
 * consumption and wallet verification commit in one transaction.
 */
export function createSupabaseCompleteWalletVerification(): CompleteWalletVerification {
  return async function completeWalletVerification(
    input: CompleteWalletVerificationInput
  ): Promise<CompleteWalletVerificationResult> {
    const supabase = requireClient();
    const { data, error } = await supabase.rpc(
      "complete_wallet_ownership_verification",
      {
        p_challenge_id: input.challengeId,
        p_profile_id: input.profileId,
        p_wallet_id: input.walletId,
        p_verified_at: input.verifiedAt,
      }
    );

    if (error) {
      mapRpcError(error);
    }
    if (!data || typeof data !== "object") {
      throw new Error("Atomic wallet verification returned no payload.");
    }

    const payload = data as RpcPayload;
    if (!payload.challenge || !payload.wallet) {
      throw new Error("Atomic wallet verification returned an incomplete payload.");
    }

    return {
      challenge: mapChallenge(payload.challenge),
      wallet: mapWallet(payload.wallet),
    };
  };
}
