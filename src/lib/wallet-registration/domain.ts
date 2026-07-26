import type {
  ProfileWallet,
  ProfileWalletRole,
  ProfileWalletVerificationStatus,
  WalletChainNamespace,
} from "@/lib/profile-wallets/domain";

/**
 * Wallet registration (PR9) — link a connected wallet to a profile.
 *
 * Registration is not ownership verification. Newly registered wallets remain
 * `pending` until a successful PR4 challenge signature completes.
 */

export type RegisterWalletRequest = {
  address: string;
  chainNamespace: WalletChainNamespace;
  /**
   * Role for newly created wallets. Defaults to `connected`.
   * Existing wallets retain their current role unchanged.
   */
  role?: ProfileWalletRole;
};

export type RegisterWalletResult = {
  wallet: ProfileWallet;
  /** True when a new profile_wallets row was created. */
  created: boolean;
};

export type WalletRegistrationErrorCode =
  | "unsupported_namespace"
  | "invalid_address"
  | "wallet_ownership_conflict"
  | "wallet_revoked"
  | "wallet_disconnected"
  | "duplicate_registration";

export class WalletRegistrationError extends Error {
  readonly code: WalletRegistrationErrorCode;

  constructor(code: WalletRegistrationErrorCode, message: string) {
    super(message);
    this.name = "WalletRegistrationError";
    this.code = code;
  }
}

export class WalletRegistrationOwnershipConflictError extends WalletRegistrationError {
  constructor(message = "Wallet is already registered to another profile.") {
    super("wallet_ownership_conflict", message);
    this.name = "WalletRegistrationOwnershipConflictError";
  }
}

export class WalletRegistrationRevokedError extends WalletRegistrationError {
  constructor(message = "Revoked wallets cannot be re-registered silently.") {
    super("wallet_revoked", message);
    this.name = "WalletRegistrationRevokedError";
  }
}

export class WalletRegistrationDisconnectedError extends WalletRegistrationError {
  constructor(
    message = "Disconnected wallets cannot be reactivated without an explicit reconnect action."
  ) {
    super("wallet_disconnected", message);
    this.name = "WalletRegistrationDisconnectedError";
  }
}

export class WalletRegistrationDuplicateError extends WalletRegistrationError {
  constructor(message = "Wallet is already registered to this profile.") {
    super("duplicate_registration", message);
    this.name = "WalletRegistrationDuplicateError";
  }
}

export type RegisteredWalletView = {
  walletId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  normalizedAddress: string;
  role: ProfileWalletRole;
  verificationStatus: ProfileWalletVerificationStatus;
  verifiedAt: string | null;
  disconnectedAt: string | null;
};

export function toRegisteredWalletView(wallet: ProfileWallet): RegisteredWalletView {
  return {
    walletId: wallet.id,
    chainNamespace: wallet.chainNamespace,
    address: wallet.address,
    normalizedAddress: wallet.normalizedAddress,
    role: wallet.role,
    verificationStatus: wallet.verificationStatus,
    verifiedAt: wallet.verifiedAt,
    disconnectedAt: wallet.disconnectedAt,
  };
}
