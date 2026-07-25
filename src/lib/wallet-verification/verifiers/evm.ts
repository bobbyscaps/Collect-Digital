import { verifyMessage } from "viem";
import type { Address, Hex } from "viem";

import type { SignatureVerificationInput } from "@/lib/wallet-verification/signature-verifier";

function asHexSignature(signature: string): Hex {
  const trimmed = signature.trim();
  if (trimmed.startsWith("0x")) {
    return trimmed as Hex;
  }
  return `0x${trimmed}` as Hex;
}

export async function verifyEvmPersonalSign(
  input: Pick<SignatureVerificationInput, "address" | "message" | "signature">
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: input.address as Address,
      message: input.message,
      signature: asHexSignature(input.signature),
    });
  } catch {
    return false;
  }
}
