export type WalletChainNamespace = "eip155" | "solana";

export type ProfileWalletRole = "login" | "primary" | "connected";

export type ProfileWalletVerificationStatus = "pending" | "verified" | "revoked";

export interface ProfileWallet {
  id: string;
  profileId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  normalizedAddress: string;
  role: ProfileWalletRole;
  verificationStatus: ProfileWalletVerificationStatus;
  verifiedAt: string | null;
  disconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileWalletInput {
  profileId: string;
  chainNamespace: WalletChainNamespace;
  address: string;
  role: ProfileWalletRole;
  verificationStatus?: ProfileWalletVerificationStatus;
  verifiedAt?: string | null;
}

const ROLE_TRANSITIONS: Record<
  ProfileWalletRole,
  readonly ProfileWalletRole[]
> = {
  login: ["login", "primary", "connected"],
  primary: ["primary", "connected"],
  connected: ["connected", "primary"],
};

const VERIFICATION_TRANSITIONS: Record<
  ProfileWalletVerificationStatus,
  readonly ProfileWalletVerificationStatus[]
> = {
  pending: ["pending", "verified", "revoked"],
  verified: ["verified", "revoked"],
  revoked: ["revoked", "verified"],
};

export function canTransitionWalletRole(
  from: ProfileWalletRole,
  to: ProfileWalletRole
): boolean {
  return ROLE_TRANSITIONS[from].includes(to);
}

export function canTransitionWalletVerificationStatus(
  from: ProfileWalletVerificationStatus,
  to: ProfileWalletVerificationStatus
): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}
