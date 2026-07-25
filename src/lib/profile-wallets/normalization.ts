import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

export class ProfileWalletNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileWalletNormalizationError";
  }
}

export function isWalletChainNamespace(
  value: string
): value is WalletChainNamespace {
  return value === "eip155" || value === "solana";
}

export function normalizeWalletAddress(
  chainNamespace: WalletChainNamespace,
  address: string
): string {
  const cleaned = address.trim();
  if (!cleaned) {
    throw new ProfileWalletNormalizationError("Wallet address cannot be empty.");
  }

  if (chainNamespace === "eip155") {
    return cleaned.toLowerCase();
  }

  if (chainNamespace === "solana") {
    return cleaned;
  }

  // Unreachable in strongly typed callers; protects runtime inputs.
  throw new ProfileWalletNormalizationError(
    `Unsupported wallet chain namespace: ${String(chainNamespace)}`
  );
}

export function normalizeWalletAddressOrThrow(
  chainNamespace: string,
  address: string
): {
  chainNamespace: WalletChainNamespace;
  normalizedAddress: string;
} {
  if (!isWalletChainNamespace(chainNamespace)) {
    throw new ProfileWalletNormalizationError(
      `Unsupported wallet chain namespace: ${chainNamespace}`
    );
  }

  return {
    chainNamespace,
    normalizedAddress: normalizeWalletAddress(chainNamespace, address),
  };
}
