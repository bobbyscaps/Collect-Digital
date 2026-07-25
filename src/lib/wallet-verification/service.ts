import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import { isWalletChainNamespace } from "@/lib/profile-wallets/normalization";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  createAuthenticatedProfileContext,
  resolveTrustedProfileId,
  type AuthenticatedProfileContext,
} from "@/lib/wallet-verification/auth-context";
import { buildWalletOwnershipChallengeMessage } from "@/lib/wallet-verification/challenge-message";
import {
  createInMemoryCompleteWalletVerification,
  type CompleteWalletVerification,
} from "@/lib/wallet-verification/completion";
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
  walletId: string;
  /**
   * Optional untrusted client claim. When present it must match auth.profileId.
   * Trusted identity always comes from AuthenticatedProfileContext.
   */
  claimedProfileId?: string;
  ttlMs?: number;
  now?: Date;
}

export interface CreateVerificationChallengeResult {
  challenge: WalletVerificationChallenge;
  message: string;
}

export interface VerifyWalletOwnershipRequest {
  walletId: string;
  challengeId: string;
  signature: string;
  /**
   * Optional address asserted by the client. When provided it must match the
   * challenge wallet after normalization; mismatches raise WrongWalletError.
   */
  address?: string;
  /**
   * Optional untrusted client claim. When present it must match auth.profileId.
   */
  claimedProfileId?: string;
  now?: Date;
}

export interface WalletVerificationService {
  createChallenge(
    auth: AuthenticatedProfileContext,
    request: CreateVerificationChallengeRequest
  ): Promise<CreateVerificationChallengeResult>;
  verifyOwnership(
    auth: AuthenticatedProfileContext,
    request: VerifyWalletOwnershipRequest
  ): Promise<ProfileWallet>;
}

export interface CreateWalletVerificationServiceOptions {
  profileWallets: ProfileWalletRepository;
  challenges: WalletVerificationChallengeRepository;
  /**
   * Atomic consume+verify. Defaults to the in-memory transactional helper.
   * Production wiring should pass createSupabaseCompleteWalletVerification().
   */
  completeVerification?: CompleteWalletVerification;
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
  const completeVerification =
    options.completeVerification ??
    createInMemoryCompleteWalletVerification({
      challenges: options.challenges,
      profileWallets: options.profileWallets,
    });

  return {
    async createChallenge(
      auth: AuthenticatedProfileContext,
      request: CreateVerificationChallengeRequest
    ): Promise<CreateVerificationChallengeResult> {
      const profileId = resolveTrustedProfileId({
        auth,
        claimedProfileId: request.claimedProfileId,
      });

      const wallet = await requireOwnedWallet(
        options.profileWallets,
        profileId,
        request.walletId
      );

      if (!isWalletChainNamespace(wallet.chainNamespace)) {
        throw new UnsupportedNamespaceError(String(wallet.chainNamespace));
      }

      const now = request.now ?? new Date();
      const ttlMs = request.ttlMs ?? DEFAULT_CHALLENGE_TTL_MS;
      const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

      const challenge = await options.challenges.createChallenge({
        profileId,
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
      auth: AuthenticatedProfileContext,
      request: VerifyWalletOwnershipRequest
    ): Promise<ProfileWallet> {
      const profileId = resolveTrustedProfileId({
        auth,
        claimedProfileId: request.claimedProfileId,
      });

      const wallet = await requireOwnedWallet(
        options.profileWallets,
        profileId,
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
        profileId,
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

      // Canonical message is always reconstructed server-side from persisted rows.
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

      const roleBefore = wallet.role;
      const { wallet: verified } = await completeVerification({
        challengeId: challenge.id,
        profileId,
        walletId: wallet.id,
        verifiedAt: now.toISOString(),
        now,
      });

      if (verified.role !== roleBefore) {
        throw new Error(
          "Wallet verification unexpectedly modified wallet role."
        );
      }

      return verified;
    },
  };
}

export { createAuthenticatedProfileContext };
