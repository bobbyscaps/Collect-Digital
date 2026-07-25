import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

export interface WalletVerificationChallenge {
  id: string;
  profileId: string;
  walletId: string;
  nonce: string;
  chainNamespace: WalletChainNamespace;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface CreateWalletVerificationChallengeInput {
  profileId: string;
  walletId: string;
  nonce: string;
  chainNamespace: WalletChainNamespace;
  expiresAt: string;
}

export type WalletVerificationErrorCode =
  | "invalid_signature"
  | "expired_challenge"
  | "consumed_challenge"
  | "challenge_not_found"
  | "wrong_wallet"
  | "unsupported_namespace"
  | "wallet_not_found"
  | "wallet_profile_mismatch";

export class WalletVerificationError extends Error {
  readonly code: WalletVerificationErrorCode;

  constructor(code: WalletVerificationErrorCode, message: string) {
    super(message);
    this.name = "WalletVerificationError";
    this.code = code;
  }
}

export class InvalidSignatureError extends WalletVerificationError {
  constructor(message = "Invalid wallet ownership signature.") {
    super("invalid_signature", message);
    this.name = "InvalidSignatureError";
  }
}

export class ExpiredChallengeError extends WalletVerificationError {
  constructor(message = "Wallet verification challenge has expired.") {
    super("expired_challenge", message);
    this.name = "ExpiredChallengeError";
  }
}

export class ConsumedChallengeError extends WalletVerificationError {
  constructor(message = "Wallet verification challenge has already been used.") {
    super("consumed_challenge", message);
    this.name = "ConsumedChallengeError";
  }
}

export class ChallengeNotFoundError extends WalletVerificationError {
  constructor(message = "Wallet verification challenge not found.") {
    super("challenge_not_found", message);
    this.name = "ChallengeNotFoundError";
  }
}

export class WrongWalletError extends WalletVerificationError {
  constructor(message = "Signature does not match the challenge wallet.") {
    super("wrong_wallet", message);
    this.name = "WrongWalletError";
  }
}

export class UnsupportedNamespaceError extends WalletVerificationError {
  constructor(namespace: string) {
    super(
      "unsupported_namespace",
      `Unsupported wallet chain namespace for verification: ${namespace}`
    );
    this.name = "UnsupportedNamespaceError";
  }
}

export class VerificationWalletNotFoundError extends WalletVerificationError {
  constructor(message = "Profile wallet not found for verification.") {
    super("wallet_not_found", message);
    this.name = "VerificationWalletNotFoundError";
  }
}

export class WalletProfileMismatchError extends WalletVerificationError {
  constructor(message = "Wallet does not belong to the authenticated profile.") {
    super("wallet_profile_mismatch", message);
    this.name = "WalletProfileMismatchError";
  }
}

export const DEFAULT_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function isChallengeExpired(
  challenge: Pick<WalletVerificationChallenge, "expiresAt">,
  now: Date = new Date()
): boolean {
  return Date.parse(challenge.expiresAt) <= now.getTime();
}

export function isChallengeConsumed(
  challenge: Pick<WalletVerificationChallenge, "consumedAt">
): boolean {
  return challenge.consumedAt != null;
}

export function isChallengeActive(
  challenge: WalletVerificationChallenge,
  now: Date = new Date()
): boolean {
  return !isChallengeConsumed(challenge) && !isChallengeExpired(challenge, now);
}
