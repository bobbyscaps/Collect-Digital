import type {
  ProfileWalletRole,
  ProfileWalletVerificationStatus,
  WalletChainNamespace,
} from "@/lib/profile-wallets/domain";

/**
 * Typed transport models for PR9 wallet registration, ownership verification,
 * and first inventory sync. Frontend clients consume only these shapes.
 */

export type WalletApiWallet = {
  walletId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  normalizedAddress: string;
  role: ProfileWalletRole;
  verificationStatus: ProfileWalletVerificationStatus;
  verifiedAt: string | null;
  disconnectedAt: string | null;
};

export type WalletInventorySyncOutcome = {
  status: "success" | "failure" | "skipped";
  syncId: string | null;
  errorMessage: string | null;
  writtenCount: number | null;
  removedCount: number | null;
  /** True when previous holdings were preserved (failure / skipped paths). */
  previousInventoryPreserved: boolean;
};

export type RegisterWalletResponse = {
  wallet: WalletApiWallet;
  created: boolean;
};

export type CreateVerificationChallengeResponse = {
  challengeId: string;
  walletId: string;
  chainNamespace: WalletChainNamespace;
  normalizedAddress: string;
  expiresAt: string;
  /** Canonical Collect Digital verification message — sign this text only. */
  message: string;
};

export type VerifyWalletOwnershipResponse = {
  wallet: WalletApiWallet;
  inventorySync: WalletInventorySyncOutcome;
};

export type SyncWalletInventoryResponse = {
  wallet: WalletApiWallet;
  inventorySync: WalletInventorySyncOutcome;
};

export type WalletVerificationFlowErrorCode =
  | "authentication_required"
  | "invalid_token"
  | "invalid_request"
  | "unsupported_namespace"
  | "invalid_address"
  | "wallet_ownership_conflict"
  | "wallet_revoked"
  | "wallet_disconnected"
  | "duplicate_registration"
  | "wallet_not_found"
  | "wallet_profile_mismatch"
  | "invalid_signature"
  | "expired_challenge"
  | "consumed_challenge"
  | "challenge_not_found"
  | "wrong_wallet"
  | "wallet_not_verified"
  | "wallet_pending"
  | "sync_failed"
  | "service_unavailable"
  | "internal_error";

export type WalletVerificationFlowApiError = {
  code: WalletVerificationFlowErrorCode;
  message: string;
};

export type WalletVerificationFlowErrorResponse = {
  error: WalletVerificationFlowApiError;
};
