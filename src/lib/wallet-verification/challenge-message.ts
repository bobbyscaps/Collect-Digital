import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import type { WalletVerificationChallenge } from "@/lib/wallet-verification/domain";

export function buildWalletOwnershipChallengeMessage(input: {
  challenge: Pick<
    WalletVerificationChallenge,
    "nonce" | "expiresAt" | "chainNamespace" | "profileId"
  >;
  wallet: Pick<ProfileWallet, "address" | "normalizedAddress" | "chainNamespace">;
}): string {
  const { challenge, wallet } = input;
  return [
    "Collect Digital — verify wallet ownership",
    "",
    `Profile: ${challenge.profileId}`,
    `Namespace: ${challenge.chainNamespace}`,
    `Wallet: ${wallet.address}`,
    `Normalized: ${wallet.normalizedAddress}`,
    `Nonce: ${challenge.nonce}`,
    `Expires: ${challenge.expiresAt}`,
    "",
    "Signing this message proves you control this wallet.",
    "It does not grant spending permissions.",
  ].join("\n");
}
