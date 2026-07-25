import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type { WalletVerificationChallenge } from "@/lib/wallet-verification/domain";

/**
 * Canonical server-side ownership challenge message.
 *
 * Callers must reconstruct this from persisted challenge + wallet rows.
 * Never accept arbitrary client-provided message text as the source of truth.
 */
export function buildWalletOwnershipChallengeMessage(input: {
  challenge: Pick<
    WalletVerificationChallenge,
    | "profileId"
    | "walletId"
    | "nonce"
    | "chainNamespace"
    | "createdAt"
    | "expiresAt"
  >;
  wallet: Pick<ProfileWallet, "normalizedAddress" | "chainNamespace">;
}): string {
  const { challenge, wallet } = input;
  return [
    "Collect Digital Wallet Ownership Verification",
    "",
    "Intent: Prove control of the listed wallet for Collect Digital profile binding.",
    "Signing this message does not initiate a blockchain transaction.",
    "Signing does not grant spending permissions or transfer assets.",
    "",
    `Profile ID: ${challenge.profileId}`,
    `Wallet ID: ${challenge.walletId}`,
    `Normalized Address: ${wallet.normalizedAddress}`,
    `Chain Namespace: ${challenge.chainNamespace}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.createdAt}`,
    `Expires At: ${challenge.expiresAt}`,
  ].join("\n");
}
