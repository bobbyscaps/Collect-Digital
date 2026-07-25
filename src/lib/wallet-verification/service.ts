import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import { isWalletChainNamespace } from "@/lib/profile-wallets/normalization";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import { buildWalletOwnershipChallengeMessage } from "@/lib/wallet-verification/challenge-message";
import {
  ChallengeNotFoundError,
  DEFAULT_CHALLENGE_TTL_MS,
  InvalidSignatureError,
  UnsupportedNamespaceError,
  VerificationWalletNotFoundError,
  WalletProfileMismatchError,
  WrongWalletError,
  type WalletVerificationChallenge,
} from "@/lib/wallet-verification/domain";
import {
  createChallengeNonce,
  type WalletVerificationChallengeRepository,
} from "@/lib/wallet-verification/repository";
import type { SignatureVerifier } from "@/lib/wallet-verification/signature-verifier";
import { createDefaultSignatureVerifier } from "@/lib/wallet-verification/verifiers/create-signature-verifier";

export interface CreateVerificationChallengeRequest {
  profileId: string;
  walletId: string;
  ttlMs?: number;
  now?: Date;
}

export interface CreateVerificationChallengeResult {
  challenge: WalletVerificationChallenge;
  message: string;
}

export interface VerifyWalletOwnershipRequest {
  profileId: string;
  walletId: string;
  challengeId: string;
  signature: string;
  /**
   * Optional address asserted by the client. When provided it must match the
   * challenge wallet after normalization; mismatches raise WrongWalletError.
   */
  address?: string;
  now?: Date;
}

export interface WalletVerificationService {
  createChallenge(
    request: CreateVerificationChallengeRequest
  ): Promise<CreateVerificationChallengeResult>;
  verifyOwnership(request: VerifyWalletOwnershipRequest): Promise<ProfileWallet>;
}

export interface CreateWalletVerificationServiceOptions {
  profileWallets: ProfileWalletRepository;
  challenges: WalletVerificationChallengeRepository;
  signatureVerifier?: SignatureVerifier;
}

async function requireOwnedWallet(
  profileWallets: ProfileWalletRepository,
  profileId: string,
  walletId: string
): Promise<ProfileWallet> {
  const wallet = await profileWallets.findWalletById(walletId);
  if (!wallet) {
    throw new VerificationWalletNotFoundError(
      `Profile wallet not found: ${walletId}`
    );
  }
  if (wallet.profileId !== profileId) {
    throw new WalletProfileMismatchError(
      `Wallet ${walletId} does not belong to profile ${profileId}`
    );
  }
  return wallet;
}

export function createWalletVerificationService(
  options: CreateWalletVerificationServiceOptions
): WalletVerificationService {
  const signatureVerifier =
    options.signatureVerifier ?? createDefaultSignatureVerifier();

  return {
    async createChallenge(
      request: CreateVerificationChallengeRequest
    ): Promise<CreateVerificationChallengeResult> {
      const wallet = await requireOwnedWallet(
        options.profileWallets,
        request.profileId,
        request.walletId
      );

      if (!isWalletChainNamespace(wallet.chainNamespace)) {
        throw new UnsupportedNamespaceError(String(wallet.chainNamespace));
      }

      const now = request.now ?? new Date();
      const ttlMs = request.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS;
      const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

      const challenge = await options.challenges.createChallenge({
        profileId: request.profileId,
        walletId: wallet.id,
        nonce: createChallengeNonce(),
        chainNamespace: wallet.chainNamespace,
        expiresAt,
      });

      return {
        challenge,
        message: buildWalletOwnershipChallengeMessage({ challenge, wallet }),
      };
    },

    async verifyOwnership(
      request: VerifyWalletOwnershipRequest
    ): Promise<ProfileWallet> {
      const wallet = await requireOwnedWallet(
        options.profileWallets,
        request.profileId,
        request.walletId
      );

      if (!isWalletChainNamespace(wallet.chainNamespace)) {
        throw new UnsupportedNamespaceError(String(wallet.chainNamespace));
      }

      if (request.address != null) {
        const asserted = request.address.trim();
        const matches =
          wallet.chainNamespace === "eip155"
            ? asserted.toLowerCase() === wallet.normalizedAddress
            : asserted === wallet.normalizedAddress || asserted === wallet.address;
        if (!matches) {
          throw new WrongWalletError(
            "Submitted address does not match the challenge wallet."
          );
        }
      }

      const now = request.now ?? new Date();
      const challenge = await options.challenges.findActiveChallenge({
        id: request.challengeId,
        profileId: request.profileId,
        walletId: request.walletId,
        now,
      });

      if (!challenge) {
        throw new ChallengeNotFoundError(
          `No active verification challenge for id ${request.challengeId}`
        );
      }

      if (challenge.walletId !== wallet.id) {
        throw new WrongWalletError(
          "Challenge is not tied to the submitted wallet."
        );
      }

      if (challenge.chainNamespace !== wallet.chainNamespace) {
        throw new UnsupportedNamespaceError(challenge.chainNamespace);
      }

      const message = buildWalletOwnershipChallengeMessage({ challenge, wallet });
      const valid = await signatureVerifier.verify({
        chainNamespace: wallet.chainNamespace,
        address: wallet.address,
        message,
        signature: request.signature,
      });

      if (!valid) {
        throw new InvalidSignatureError();
      }

      // Consume before marking verified so retries cannot reuse the challenge.
      await options.challenges.consumeChallenge(
        challenge.id,
        now.toISOString()
      );

      const roleBefore = wallet.role;
      const verified = await options.profileWallets.markWalletVerified(
        wallet.id,
        now.toISOString()
      );

      if (verified.role !== roleBefore) {
        // Defensive invariant: verification must never mutate wallet roles.
        throw new Error(
          "Wallet verification unexpectedly modified wallet role."
        );
      }

      return verified;
    },
  };
}
