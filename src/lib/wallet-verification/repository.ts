import { randomBytes, randomUUID } from "node:crypto";

import type {
  CreateWalletVerificationChallengeInput,
  WalletVerificationChallenge,
} from "@/lib/wallet-verification/domain";
import {
  ChallengeNotFoundError,
  ConsumedChallengeError,
  ExpiredChallengeError,
  isChallengeActive,
  isChallengeConsumed,
  isChallengeExpired,
} from "@/lib/wallet-verification/domain";

export interface FindActiveChallengeInput {
  id: string;
  profileId: string;
  walletId: string;
  now?: Date;
}

export interface WalletVerificationChallengeRepository {
  createChallenge(
    input: CreateWalletVerificationChallengeInput
  ): Promise<WalletVerificationChallenge>;
  findActiveChallenge(
    input: FindActiveChallengeInput
  ): Promise<WalletVerificationChallenge | null>;
  /**
   * Conditionally consumes a challenge (must be unconsumed and unexpired).
   * Database implementations use a single conditional UPDATE as the
   * single-use enforcement boundary.
   */
  consumeChallenge(
    id: string,
    consumedAt?: string
  ): Promise<WalletVerificationChallenge>;
  /**
   * Test/in-memory helper used by atomic completion rollback.
   * Supabase relies on transaction rollback instead.
   */
  rollbackConsumeChallenge?(id: string): Promise<void>;
}

function nowIso(now?: Date) {
  return (now ?? new Date()).toISOString();
}

function freezeChallenge(
  challenge: WalletVerificationChallenge
): Readonly<WalletVerificationChallenge> {
  return Object.freeze({ ...challenge });
}

/** 256-bit cryptographically secure nonce (hex-encoded). */
export function createChallengeNonce(): string {
  return randomBytes(32).toString("hex");
}

export function createInMemoryWalletVerificationChallengeRepository(): WalletVerificationChallengeRepository {
  const challenges = new Map<string, WalletVerificationChallenge>();

  function getOrThrow(id: string): WalletVerificationChallenge {
    const challenge = challenges.get(id);
    if (!challenge) {
      throw new ChallengeNotFoundError(
        `Wallet verification challenge not found: ${id}`
      );
    }
    return challenge;
  }

  return {
    async createChallenge(
      input: CreateWalletVerificationChallengeInput
    ): Promise<WalletVerificationChallenge> {
      const challenge: WalletVerificationChallenge = {
        id: randomUUID(),
        profileId: input.profileId,
        walletId: input.walletId,
        nonce: input.nonce,
        chainNamespace: input.chainNamespace,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: nowIso(),
      };
      challenges.set(challenge.id, challenge);
      return freezeChallenge(challenge);
    },

    async findActiveChallenge(
      input: FindActiveChallengeInput
    ): Promise<WalletVerificationChallenge | null> {
      const challenge = challenges.get(input.id);
      if (!challenge) return null;
      if (
        challenge.profileId !== input.profileId ||
        challenge.walletId !== input.walletId
      ) {
        return null;
      }

      const now = input.now ?? new Date();
      if (isChallengeConsumed(challenge)) {
        throw new ConsumedChallengeError(
          `Wallet verification challenge already consumed: ${challenge.id}`
        );
      }
      if (isChallengeExpired(challenge, now)) {
        throw new ExpiredChallengeError(
          `Wallet verification challenge expired: ${challenge.id}`
        );
      }
      if (!isChallengeActive(challenge, now)) {
        return null;
      }

      return freezeChallenge(challenge);
    },

    async consumeChallenge(
      id: string,
      consumedAt?: string
    ): Promise<WalletVerificationChallenge> {
      const challenge = getOrThrow(id);
      const now = consumedAt ? new Date(consumedAt) : new Date();

      // Conditional single-use gate (mirrors SQL UPDATE ... WHERE consumed_at IS NULL).
      if (isChallengeConsumed(challenge)) {
        throw new ConsumedChallengeError(
          `Wallet verification challenge already consumed: ${id}`
        );
      }
      if (isChallengeExpired(challenge, now)) {
        throw new ExpiredChallengeError(
          `Wallet verification challenge expired: ${id}`
        );
      }

      const updated: WalletVerificationChallenge = {
        ...challenge,
        consumedAt: consumedAt ?? nowIso(now),
      };
      challenges.set(id, updated);
      return freezeChallenge(updated);
    },

    async rollbackConsumeChallenge(id: string): Promise<void> {
      const challenge = getOrThrow(id);
      challenges.set(id, {
        ...challenge,
        consumedAt: null,
      });
    },
  };
}
