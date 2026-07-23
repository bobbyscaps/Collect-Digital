export type ChainEcosystem = "ethereum" | "arbitrum-orbit" | "zk-rollup";

export interface ChainRegistryEntry {
  key: string;
  displayName: string;
  chainId: number;
  ecosystem: ChainEcosystem;
  explorer: string;
  enabled: boolean;
}

const chainRegistry = [
  {
    key: "ethereum",
    displayName: "Ethereum",
    chainId: 1,
    ecosystem: "ethereum",
    explorer: "https://etherscan.io",
    enabled: true,
  },
  {
    key: "base",
    displayName: "Base",
    chainId: 8453,
    ecosystem: "ethereum",
    explorer: "https://basescan.org",
    enabled: true,
  },
  {
    key: "abstract",
    displayName: "Abstract",
    chainId: 2741,
    ecosystem: "zk-rollup",
    explorer: "https://abscan.org",
    enabled: true,
  },
  {
    key: "apechain",
    displayName: "ApeChain",
    chainId: 33139,
    ecosystem: "arbitrum-orbit",
    explorer: "https://apescan.io",
    enabled: true,
  },
  {
    key: "robinhood",
    displayName: "Robinhood Chain",
    chainId: 4663,
    ecosystem: "arbitrum-orbit",
    explorer: "https://robinhoodchain.blockscout.com",
    enabled: true,
  },
  {
    key: "polygon",
    displayName: "Polygon",
    chainId: 137,
    ecosystem: "ethereum",
    explorer: "https://polygonscan.com",
    enabled: true,
  },
  {
    key: "arbitrum",
    displayName: "Arbitrum",
    chainId: 42161,
    ecosystem: "ethereum",
    explorer: "https://arbiscan.io",
    enabled: true,
  },
  {
    key: "optimism",
    displayName: "Optimism",
    chainId: 10,
    ecosystem: "ethereum",
    explorer: "https://optimistic.etherscan.io",
    enabled: true,
  },
] as const satisfies readonly ChainRegistryEntry[];

export const CHAIN_REGISTRY = chainRegistry;

export type SupportedChainKey = (typeof CHAIN_REGISTRY)[number]["key"];
export type SupportedChainId = (typeof CHAIN_REGISTRY)[number]["chainId"];

export const SUPPORTED_CHAIN_KEYS = CHAIN_REGISTRY.map(
  (chain) => chain.key
) as readonly SupportedChainKey[];

const registryByKey = new Map<SupportedChainKey, (typeof CHAIN_REGISTRY)[number]>(
  CHAIN_REGISTRY.map((chain) => [chain.key, chain])
);

export function listConfiguredChains() {
  return [...CHAIN_REGISTRY];
}

export function listEnabledChains() {
  return CHAIN_REGISTRY.filter((chain) => chain.enabled);
}

export function getChainConfig(chainKey: SupportedChainKey) {
  return registryByKey.get(chainKey) ?? null;
}

export function hasUniqueChainIds(chains = CHAIN_REGISTRY): boolean {
  const seen = new Set<number>();
  for (const chain of chains) {
    if (seen.has(chain.chainId)) {
      return false;
    }
    seen.add(chain.chainId);
  }
  return true;
}
