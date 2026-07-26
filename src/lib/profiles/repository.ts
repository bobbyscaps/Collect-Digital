import { randomUUID } from "node:crypto";

import type {
  CollectorProfileRecord,
  CreateCollectorProfileInput,
} from "@/lib/profiles/domain";

export class ProfileNotFoundError extends Error {
  constructor(message = "Collector profile not found.") {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}

export interface ProfileRepository {
  findByPrivyUserId(privyUserId: string): Promise<CollectorProfileRecord | null>;
  findById(id: string): Promise<CollectorProfileRecord | null>;
  /**
   * Idempotent create-or-return for a Privy subject.
   * Concurrent callers with the same privyUserId must converge on one row.
   */
  getOrCreateByPrivyUserId(
    input: CreateCollectorProfileInput
  ): Promise<CollectorProfileRecord>;
}

function nowIso() {
  return new Date().toISOString();
}

function freezeProfile(
  profile: CollectorProfileRecord
): Readonly<CollectorProfileRecord> {
  return Object.freeze({ ...profile });
}

/**
 * In-memory profile repository for tests.
 * Simulates unique(privy_user_id) and concurrent get-or-create safety.
 */
export function createInMemoryProfileRepository(): ProfileRepository {
  const byId = new Map<string, CollectorProfileRecord>();
  const idByPrivy = new Map<string, string>();
  /** Simple mutex per privy user id for concurrent first-login races. */
  const locks = new Map<string, Promise<CollectorProfileRecord>>();

  async function findByPrivyUserId(
    privyUserId: string
  ): Promise<CollectorProfileRecord | null> {
    const id = idByPrivy.get(privyUserId.trim());
    if (!id) return null;
    const profile = byId.get(id);
    return profile ? freezeProfile(profile) : null;
  }

  async function findById(id: string): Promise<CollectorProfileRecord | null> {
    const profile = byId.get(id);
    return profile ? freezeProfile(profile) : null;
  }

  async function getOrCreateByPrivyUserId(
    input: CreateCollectorProfileInput
  ): Promise<CollectorProfileRecord> {
    const privyUserId = input.privyUserId.trim();
    if (!privyUserId) {
      throw new Error("privyUserId is required to resolve a Collect Digital profile.");
    }

    const existing = await findByPrivyUserId(privyUserId);
    if (existing) return existing;

    const inflight = locks.get(privyUserId);
    if (inflight) return inflight;

    const creation = (async () => {
      // Re-check after acquiring the logical lock.
      const again = await findByPrivyUserId(privyUserId);
      if (again) return again;

      const timestamp = nowIso();
      const profile: CollectorProfileRecord = {
        id: randomUUID(),
        privyUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      byId.set(profile.id, profile);
      idByPrivy.set(privyUserId, profile.id);
      return freezeProfile(profile);
    })().finally(() => {
      locks.delete(privyUserId);
    });

    locks.set(privyUserId, creation);
    return creation;
  }

  return {
    findByPrivyUserId,
    findById,
    getOrCreateByPrivyUserId,
  };
}
