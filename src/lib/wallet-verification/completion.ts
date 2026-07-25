import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  ChallengeNotFoundError,
  ConsumedChallengeError,
  ExpiredChallengeError,
  VerificationWalletNotFoundError,
  type WalletVerificationChallenge,
} from "@/lib/wallet-verification/domain";
import type { WalletVerificationChallengeRepository } from "@/lib/wallet-verification/repository";

export interface CompleteWalletVerificationInput {
  challengeId: string;
  profileId: string;
  walletId: string;
  verifiedAt: string;
  now?: Date;
}

export interface CompleteWalletVerificationResult {
  challenge: WalletVerificationChallenge;
  wallet: ProfileWallet;
}

/**
 * Atomically consumes an active challenge and marks the wallet verified.
 * Implementations must commit both state changes or neither.
 */
export type CompleteWalletVerification = (
  input: CompleteWalletVerificationInput
) => Promise<CompleteWalletVerificationResult>;

function createSerialLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

/**
 * In-memory atomic completion used by tests and non-DB environments.
 * Serializes concurrent completions and rolls back challenge consumption if
 * wallet verification persistence fails.
 */
export function createInMemoryCompleteWalletVerification(deps: {
  challenges: WalletVerificationChallengeRepository;
  profileWallets: ProfileWalletRepository;
}): CompleteWalletVerification {
  const withLock = createSerialLock();

  return async function completeWalletVerification(
    input: CompleteWalletVerificationInput
  ): Promise<CompleteWalletVerificationResult> {
    return withLock(async () => {
      const now = input.now ?? new Date(input.verifiedAt);
      const active = await deps.challenges.findActiveChallenge({
        id: input.challengeId,
        profileId: input.profileId,
        walletId: input.walletId,
        now,
      });
      if (!active) {
        throw new ChallengeNotFoundError(
          `No active verification challenge for id ${input.challengeId}`
        );
      }

      const consumed = await deps.challenges.consumeChallenge(
        active.id,
        input.verifiedAt
      );

      try {
        const wallet = await deps.profileWallets.markWalletVerified(
          input.walletId,
          input.verifiedAt
        );
        if (wallet.profileId !== input.profileId) {
          throw new VerificationWalletNotFoundError(
            `Wallet ${input.walletId} does not belong to profile ${input.profileId}`
          );
        }
        return { challenge: consumed, wallet };
      } catch (error) {
        // Roll back conditional consume so the challenge remains usable only
        // when verification persistence failed after validation.
        await rollbackConsumedChallenge(deps.challenges, consumed);
        throw error;
      }
    });
  };
}

async function rollbackConsumedChallenge(
  challenges: WalletVerificationChallengeRepository,
  consumed: WalletVerificationChallenge
): Promise<void> {
  const rollbackable = challenges as WalletVerificationChallengeRepository & {
    rollbackConsumeChallenge?: (id: string) => Promise<void>;
  };
  if (typeof rollbackable.rollbackConsumeChallenge === "function") {
    await rollbackable.rollbackConsumeChallenge(consumed.id);
    return;
  }
  throw new Error(
    "Atomic verification rollback is unavailable for this challenge repository."
  );
}

export {
  ChallengeNotFoundError,
  ConsumedChallengeError,
  ExpiredChallengeError,
};
