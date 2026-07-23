export type ChainNamespace = "eip155";

export type ChainStack =
  | "ethereum-l1"
  | "op-stack"
  | "arbitrum-one"
  | "arbitrum-orbit"
  | "polygon-pos"
  | "zksync-abstract";

export interface ChainRegistryEntry {
  key: string;
  displayName: string;
  chainId: number;
  namespace: ChainNamespace;
  stack: ChainStack;
  explorer: string;
  /**
   * Controls whether the chain is eligible for Collector Scoring aggregation.
   * This flag does not imply provider coverage or capability support.
   */
  collectorScoringEnabled: boolean;
}

const chainRegistry = [
  {
    key: "ethereum",
    displayName: "Ethereum",
    chainId: 1,
    namespace: "eip155",
    stack: "ethereum-l1",
    explorer: "https://etherscan.io",
    collectorScoringEnabled: true,
  },
  {
    key: "base",
    displayName: "Base",
    chainId: 8453,
    namespace: "eip155",
    stack: "op-stack",
    explorer: "https://basescan.org",
    collectorScoringEnabled: true,
  },
  {
    key: "abstract",
    displayName: "Abstract",
    chainId: 2741,
    namespace: "eip155",
    stack: "zksync-abstract",
    explorer: "https://abscan.org",
    collectorScoringEnabled: true,
  },
  {
    key: "apechain",
    displayName: "ApeChain",
    chainId: 33139,
    namespace: "eip155",
    stack: "arbitrum-orbit",
    explorer: "https://apescan.io",
    collectorScoringEnabled: true,
  },
  {
    key: "robinhood",
    displayName: "Robinhood Chain",
    chainId: 4663,
    namespace: "eip155",
    stack: "arbitrum-orbit",
    explorer: "https://robinhoodchain.blockscout.com",
    collectorScoringEnabled: true,
  },
  {
    key: "polygon",
    displayName: "Polygon",
    chainId: 137,
    namespace: "eip155",
    stack: "polygon-pos",
    explorer: "https://polygonscan.com",
    collectorScoringEnabled: true,
  },
  {
    key: "arbitrum",
    displayName: "Arbitrum",
    chainId: 42161,
    namespace: "eip155",
    stack: "arbitrum-one",
    explorer: "https://arbiscan.io",
    collectorScoringEnabled: true,
  },
  {
    key: "optimism",
    displayName: "Optimism",
    chainId: 10,
    namespace: "eip155",
    stack: "op-stack",
    explorer: "https://optimistic.etherscan.io",
    collectorScoringEnabled: true,
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

export function listCollectorScoringEnabledChains() {
  return CHAIN_REGISTRY.filter((chain) => chain.collectorScoringEnabled);
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
