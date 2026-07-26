import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";

/**
 * Client-side connected wallet descriptor for verification selection.
 * Built from Privy connected wallets — never from server domain types.
 */
export type SelectableConnectedWallet = {
  /** Stable selection key: `${chainNamespace}:${address}` */
  key: string;
  address: string;
  chainNamespace: WalletChainNamespace;
  /** Human label for UI (e.g. MetaMask, Phantom, Embedded). */
  label: string;
  chainLabel: string;
};

export function shortenWalletAddress(address: string, chars = 4): string {
  const trimmed = address.trim();
  if (trimmed.length <= chars * 2 + 2) return trimmed;
  return `${trimmed.slice(0, chars + 2)}…${trimmed.slice(-chars)}`;
}

export function walletSelectionKey(
  chainNamespace: WalletChainNamespace,
  address: string
): string {
  return `${chainNamespace}:${address}`;
}

export function mapPrivyChainTypeToNamespace(
  chainType: string
): WalletChainNamespace | null {
  if (chainType === "ethereum") return "eip155";
  if (chainType === "solana") return "solana";
  return null;
}

export function buildSelectableWallet(input: {
  address: string;
  chainNamespace: WalletChainNamespace;
  label?: string;
}): SelectableConnectedWallet {
  const address = input.address.trim();
  return {
    key: walletSelectionKey(input.chainNamespace, address),
    address,
    chainNamespace: input.chainNamespace,
    label: input.label?.trim() || "Wallet",
    chainLabel: input.chainNamespace === "eip155" ? "EVM" : "Solana",
  };
}

/**
 * Deduplicate wallets by chain namespace + address (case-sensitive for Solana,
 * case-insensitive for EVM display keys use the raw address from Privy).
 */
export function dedupeSelectableWallets(
  wallets: readonly SelectableConnectedWallet[]
): SelectableConnectedWallet[] {
  const seen = new Set<string>();
  const result: SelectableConnectedWallet[] = [];
  for (const wallet of wallets) {
    const dedupeKey =
      wallet.chainNamespace === "eip155"
        ? `${wallet.chainNamespace}:${wallet.address.toLowerCase()}`
        : wallet.key;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(wallet);
  }
  return result;
}
