import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * Provider-independent signature verification contract.
 * Concrete EVM/Solana adapters live behind this interface so repositories
 * and verification business logic never import crypto provider details.
 */
export interface SignatureVerificationInput {
  chainNamespace: WalletChainNamespace;
  address: string;
  message: string;
  signature: string;
}

export interface SignatureVerifier {
  verify(input: SignatureVerificationInput): Promise<boolean>;
}
