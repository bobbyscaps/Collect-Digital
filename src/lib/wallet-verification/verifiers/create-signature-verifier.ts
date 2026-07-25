import { isWalletChainNamespace } from "@/lib/profile-wallets/normalization";
import { UnsupportedNamespaceError } from "@/lib/wallet-verification/domain";
import type {
  SignatureVerificationInput,
  SignatureVerifier,
} from "@/lib/wallet-verification/signature-verifier";
import { verifyEvmPersonalSign } from "@/lib/wallet-verification/verifiers/evm";
import { verifySolanaSignMessage } from "@/lib/wallet-verification/verifiers/solana";

/**
 * Default signature verifier for EVM personal_sign / signMessage and
 * Solana signMessage. Kept outside repositories and service orchestration.
 */
export function createDefaultSignatureVerifier(): SignatureVerifier {
  return {
    async verify(input: SignatureVerificationInput): Promise<boolean> {
      if (!isWalletChainNamespace(input.chainNamespace)) {
        throw new UnsupportedNamespaceError(String(input.chainNamespace));
      }

      if (input.chainNamespace === "eip155") {
        return verifyEvmPersonalSign(input);
      }

      if (input.chainNamespace === "solana") {
        return verifySolanaSignMessage(input);
      }

      throw new UnsupportedNamespaceError(String(input.chainNamespace));
    },
  };
}
