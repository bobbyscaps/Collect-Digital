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

export function canTransitionWalletRole(
  from: ProfileWalletRole,
  to: ProfileWalletRole
): boolean {
  return Boolean(from && to);
}

export function canTransitionWalletVerificationStatus(
  from: ProfileWalletVerificationStatus,
  to: ProfileWalletVerificationStatus
): boolean {
  return Boolean(from && to);
}
