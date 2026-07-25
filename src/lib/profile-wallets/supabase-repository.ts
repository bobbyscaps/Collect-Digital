import { createClient } from "@supabase/supabase-js";

import type {
  CreateProfileWalletInput,
  ProfileWallet,
  ProfileWalletRole,
  ProfileWalletVerificationStatus,
  WalletChainNamespace,
} from "@/lib/profile-wallets/domain";
import { env } from "@/lib/env";
import { normalizeWalletAddress } from "@/lib/profile-wallets/normalization";
import {
  ProfileWalletNotFoundError,
  ProfileWalletOwnershipConflictError,
  type ProfileWalletRepository,
} from "@/lib/profile-wallets/repository";

interface ProfileWalletRow {
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

function getAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function mapRow(row: ProfileWalletRow): ProfileWallet {
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

function duplicateWalletError(
  error: { code?: string | null; message?: string | null } | null
) {
  if (!error) return false;
  if (error.code === "23505") return true;
  if (!error.message) return false;
  return error.message.includes(
    "profile_wallets_chain_namespace_normalized_address_key"
  );
}

function requireClient() {
  const client = getAdminClient();
  if (!client) {
    throw new Error(
      "Supabase admin client unavailable for ProfileWalletRepository."
    );
  }
  return client;
}

export function createSupabaseProfileWalletRepository(): ProfileWalletRepository {
  return {
    async createWallet(input: CreateProfileWalletInput): Promise<ProfileWallet> {
      const supabase = requireClient();
      const normalizedAddress = normalizeWalletAddress(
        input.chainNamespace,
        input.address
      );
      const payload = {
        profile_id: input.profileId,
        chain_namespace: input.chainNamespace,
        address: input.address.trim(),
        normalized_address: normalizedAddress,
        role: input.role,
        verification_status: input.verificationStatus ?? "pending",
        verified_at: input.verifiedAt ?? null,
      } satisfies Partial<ProfileWalletRow>;

      const { data, error } = await supabase
        .from("profile_wallets")
        .insert(payload)
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .single<ProfileWalletRow>();

      if (duplicateWalletError(error)) {
        throw new ProfileWalletOwnershipConflictError(
          `Wallet identity already linked: ${input.chainNamespace}:${normalizedAddress}`
        );
      }
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to create profile wallet.");
      }

      return mapRow(data);
    },

    async findWalletById(id: string): Promise<ProfileWallet | null> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      return data ? mapRow(data) : null;
    },

    async findWalletByChainAndAddress(
      chainNamespace: WalletChainNamespace,
      normalizedAddress: string
    ): Promise<ProfileWallet | null> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .eq("chain_namespace", chainNamespace)
        .eq("normalized_address", normalizedAddress)
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      return data ? mapRow(data) : null;
    },

    async listWalletsByProfile(profileId: string): Promise<readonly ProfileWallet[]> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true })
        .returns<ProfileWalletRow[]>();

      if (error) {
        throw new Error(error.message);
      }
      return Object.freeze((data ?? []).map(mapRow));
    },

    async updateWalletRole(id: string, role: ProfileWalletRole): Promise<ProfileWallet> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new ProfileWalletNotFoundError(`Profile wallet not found: ${id}`);
      }
      return mapRow(data);
    },

    async updateWalletVerificationStatus(
      id: string,
      verificationStatus: ProfileWalletVerificationStatus
    ): Promise<ProfileWallet> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .update({
          verification_status: verificationStatus,
          verified_at:
            verificationStatus === "verified" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new ProfileWalletNotFoundError(`Profile wallet not found: ${id}`);
      }
      return mapRow(data);
    },

    async markWalletVerified(
      id: string,
      verifiedAt?: string
    ): Promise<ProfileWallet> {
      const supabase = requireClient();
      const timestamp = verifiedAt ?? new Date().toISOString();
      const { data, error } = await supabase
        .from("profile_wallets")
        .update({
          verification_status: "verified",
          verified_at: timestamp,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new ProfileWalletNotFoundError(`Profile wallet not found: ${id}`);
      }
      return mapRow(data);
    },

    async markWalletDisconnected(
      id: string,
      disconnectedAt?: string
    ): Promise<ProfileWallet> {
      const supabase = requireClient();
      const { data, error } = await supabase
        .from("profile_wallets")
        .update({
          disconnected_at: disconnectedAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          "id, profile_id, chain_namespace, address, normalized_address, role, verification_status, verified_at, disconnected_at, created_at, updated_at"
        )
        .maybeSingle<ProfileWalletRow>();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        throw new ProfileWalletNotFoundError(`Profile wallet not found: ${id}`);
      }
      return mapRow(data);
    },
  };
}
