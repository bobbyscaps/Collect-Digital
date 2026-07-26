import {
  createSupabaseProfileRepository,
} from "@/lib/profiles/supabase-repository";
import type { ProfileRepository } from "@/lib/profiles/repository";
import type { CollectorProfileRecord } from "@/lib/profiles/domain";

/**
 * Single server-side resolver: trusted Privy subject → internal profile UUID.
 *
 * - Finds the profiles row for the Privy user id
 * - Creates it on first login
 * - Concurrent first-login callers converge on one row (unique privy_user_id)
 *
 * Never accepts a client-supplied profile ID.
 */
export async function resolveOrCreateProfileForPrivyUser(
  privyUserId: string,
  profiles: ProfileRepository = createSupabaseProfileRepository()
): Promise<CollectorProfileRecord> {
  const trimmed = privyUserId.trim();
  if (!trimmed) {
    throw new Error("Privy user id is required to resolve profileId.");
  }

  return profiles.getOrCreateByPrivyUserId({ privyUserId: trimmed });
}

/**
 * Convenience: returns only the internal Collect Digital profile UUID.
 */
export async function resolveProfileIdFromPrivyUserId(
  privyUserId: string,
  profiles?: ProfileRepository
): Promise<string> {
  const profile = await resolveOrCreateProfileForPrivyUser(
    privyUserId,
    profiles
  );
  return profile.id;
}
