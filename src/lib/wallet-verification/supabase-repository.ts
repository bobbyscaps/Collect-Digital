import { createClient } from "@supabase/supabase-js";

import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import { env } from "@/lib/env";
import {
  ChallengeNotFoundError,
  ConsumedChallengeError,
  ExpiredChallengeError,
  isChallengeActive,
  type CreateWalletVerificationChallengeInput,
  type WalletVerificationChallenge,
} from "@/lib/wallet-verification/domain";
import type {
  FindActiveChallengeInput,
  WalletVerificationChallengeRepository,
} from "@/lib/wallet-verification/repository";

interface WalletVerificationChallengeRow {
  id: string;
  profile_id: string;
  wallet_id: string;
  nonce: string;
  chain_namespace: WalletChainNamespace;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

const CHALLENGE_SELECT =
  "id, profile_id, wallet_id, nonce, chain_namespace, expires_at, consumed_at, created_at";

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
      "Supabase admin client unavailable for WalletVerificationChallengeRepository."
    );
  }
  return client;
}

function mapRow(row: WalletVerificationChallengeRow): WalletVerificationChallenge {
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

export function createSupabaseWalletVerificationChallengeRepository(): WalletVerificationChallengeRepository {
  return {
    async createChallenge(
      input: CreateWalletVerificationChallengeInput
    ): Promise<WalletVerificationChallenge> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("wallet_verification_challenges")
        .insert({
          profile_id: input.profileId,
          wallet_id: input.walletId,
          nonce: input.nonce,
          chain_namespace: input.chainNamespace,
          expires_at: input.expiresAt,
        })
        .select(CHALLENGE_SELECT)
        .single<WalletVerificationChallengeRow>();

      if (error || !data) {
        throw new Error(
          error?.message ?? "Failed to create wallet verification challenge."
        );
      }

      return mapRow(data);
    },

    async findActiveChallenge(
      input: FindActiveChallengeInput
    ): Promise<WalletVerificationChallenge | null> {
      const supabase = requireClient();
      const now = input.now ?? new Date();
      const { data, error } = await supabase
        .from("wallet_verification_challenges")
        .select(CHALLENGE_SELECT)
        .eq("id", input.id)
        .eq("profile_id", input.profileId)
        .eq("wallet_id", input.walletId)
        .maybeSingle<WalletVerificationChallengeRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;

      const challenge = mapRow(data);
      if (challenge.consumedAt != null) {
        throw new ConsumedChallengeError(
          `Wallet verification challenge already consumed: ${challenge.id}`
        );
      }
      if (Date.parse(challenge.expiresAt) <= now.getTime()) {
        throw new ExpiredChallengeError(
          `Wallet verification challenge expired: ${challenge.id}`
        );
      }
      if (!isChallengeActive(challenge, now)) {
        return null;
      }
      return challenge;
    },

    async consumeChallenge(
      id: string,
      consumedAt?: string
    ): Promise<WalletVerificationChallenge> {
      const supabase = requireClient();
      const timestamp = consumedAt ?? new Date().toISOString();
      const now = new Date(timestamp);

      const { data: existing, error: readError } = await supabase
        .from("wallet_verification_challenges")
        .select(CHALLENGE_SELECT)
        .eq("id", id)
        .maybeSingle<WalletVerificationChallengeRow>();

      if (readError) {
        throw new Error(readError.message);
      }
      if (!existing) {
        throw new ChallengeNotFoundError(
          `Wallet verification challenge not found: ${id}`
        );
      }

      const challenge = mapRow(existing);
      if (challenge.consumedAt != null) {
        throw new ConsumedChallengeError(
          `Wallet verification challenge already consumed: ${id}`
        );
      }
      if (Date.parse(challenge.expiresAt) <= now.getTime()) {
        throw new ExpiredChallengeError(
          `Wallet verification challenge expired: ${id}`
        );
      }

      const { data, error } = await supabase
        .from("wallet_verification_challenges")
        .update({ consumed_at: timestamp })
        .eq("id", id)
        .is("consumed_at", null)
        .gt("expires_at", now.toISOString())
        .select(CHALLENGE_SELECT)
        .maybeSingle<WalletVerificationChallengeRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new ConsumedChallengeError(
          `Wallet verification challenge already consumed: ${id}`
        );
      }

      return mapRow(data);
    },
  };
}
