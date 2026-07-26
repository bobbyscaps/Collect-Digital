import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { CollectorProfileRecord } from "@/lib/profiles/domain";
import type { ProfileRepository } from "@/lib/profiles/repository";

interface ProfileRow {
  id: string;
  privy_user_id: string;
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

function requireClient() {
  const client = getAdminClient();
  if (!client) {
    throw new Error(
      "Supabase admin client unavailable for ProfileRepository."
    );
  }
  return client;
}

function mapRow(row: ProfileRow): CollectorProfileRecord {
  return {
    id: row.id,
    privyUserId: row.privy_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: { code?: string | null } | null): boolean {
  return error?.code === "23505";
}

/**
 * Production profile repository.
 * Uses service_role only — never imported by frontend bundles.
 */
export function createSupabaseProfileRepository(): ProfileRepository {
  return {
    async findByPrivyUserId(privyUserId: string) {
      const client = requireClient();
      const { data, error } = await client
        .from("profiles")
        .select("id, privy_user_id, created_at, updated_at")
        .eq("privy_user_id", privyUserId.trim())
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load profile by Privy user id: ${error.message}`);
      }
      return data ? mapRow(data as ProfileRow) : null;
    },

    async findById(id: string) {
      const client = requireClient();
      const { data, error } = await client
        .from("profiles")
        .select("id, privy_user_id, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load profile by id: ${error.message}`);
      }
      return data ? mapRow(data as ProfileRow) : null;
    },

    async getOrCreateByPrivyUserId(input) {
      const client = requireClient();
      const privyUserId = input.privyUserId.trim();
      if (!privyUserId) {
        throw new Error(
          "privyUserId is required to resolve a Collect Digital profile."
        );
      }

      const existing = await this.findByPrivyUserId(privyUserId);
      if (existing) return existing;

      const timestamp = new Date().toISOString();
      const { data, error } = await client
        .from("profiles")
        .insert({
          privy_user_id: privyUserId,
          created_at: timestamp,
          updated_at: timestamp,
        })
        .select("id, privy_user_id, created_at, updated_at")
        .single();

      if (!error && data) {
        return mapRow(data as ProfileRow);
      }

      // Concurrent first-login: unique(privy_user_id) won the race — re-read.
      if (isUniqueViolation(error)) {
        const raced = await this.findByPrivyUserId(privyUserId);
        if (raced) return raced;
      }

      throw new Error(
        `Failed to create Collect Digital profile: ${error?.message ?? "unknown error"}`
      );
    },
  };
}
