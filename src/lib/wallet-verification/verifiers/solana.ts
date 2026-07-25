import bs58 from "bs58";
import nacl from "tweetnacl";

import type { SignatureVerificationInput } from "@/lib/wallet-verification/signature-verifier";

function decodeSignature(signature: string): Uint8Array {
  const trimmed = signature.trim();
  if (trimmed.startsWith("0x")) {
    const hex = trimmed.slice(2);
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex signature length.");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return bs58.decode(trimmed);
}

export async function verifySolanaSignMessage(
  input: Pick<SignatureVerificationInput, "address" | "message" | "signature">
): Promise<boolean> {
  try {
    const publicKey = bs58.decode(input.address.trim());
    const signature = decodeSignature(input.signature);
    const message = new TextEncoder().encode(input.message);
    if (publicKey.length !== 32 || signature.length !== 64) {
      return false;
    }
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}
