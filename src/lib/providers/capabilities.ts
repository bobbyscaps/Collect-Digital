import {
  CHAIN_REGISTRY,
  type SupportedChainKey,
  SUPPORTED_CHAIN_KEYS,
} from "@/lib/chains/registry";

export const PROVIDER_KEYS = [
  "alchemy",
  "reservoir",
  "opensea",
  "simplehash",
  "moralis",
  "covalent",
] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export const PROVIDER_CAPABILITY_KEYS = [
  "wallet_holdings",
  "wallet_activity",
  "floor_prices",
  "collection_metadata",
  "listings",
  "offers",
  "sales",
  "historical_data",
] as const;

export type ProviderCapabilityKey = (typeof PROVIDER_CAPABILITY_KEYS)[number];
export type ProviderCapabilityLevel = "supported" | "unsupported" | "partial";

export type ProviderCapabilitySet = Record<
  ProviderCapabilityKey,
  ProviderCapabilityLevel
>;

export interface ProviderChainCapabilityProfile {
  capabilities: ProviderCapabilitySet;
  notes?: string;
}

type ProviderCapabilityMatrix = Record<
  ProviderKey,
  Partial<Record<SupportedChainKey, ProviderChainCapabilityProfile>>
>;

const UNSUPPORTED_CAPABILITIES: ProviderCapabilitySet = {
  wallet_holdings: "unsupported",
  wallet_activity: "unsupported",
  floor_prices: "unsupported",
  collection_metadata: "unsupported",
  listings: "unsupported",
  offers: "unsupported",
  sales: "unsupported",
  historical_data: "unsupported",
};

const SUPPORT_LEVELS = {
  unsupported: UNSUPPORTED_CAPABILITIES,
  walletOnly: {
    ...UNSUPPORTED_CAPABILITIES,
    wallet_holdings: "supported",
    wallet_activity: "partial",
  } satisfies ProviderCapabilitySet,
  collectionOnly: {
    ...UNSUPPORTED_CAPABILITIES,
    floor_prices: "partial",
    collection_metadata: "supported",
  } satisfies ProviderCapabilitySet,
  fullCollectionData: {
    wallet_holdings: "supported",
    wallet_activity: "supported",
    floor_prices: "supported",
    collection_metadata: "supported",
    listings: "supported",
    offers: "supported",
    sales: "supported",
    historical_data: "supported",
  } satisfies ProviderCapabilitySet,
  metadataOnly: {
    ...UNSUPPORTED_CAPABILITIES,
    collection_metadata: "partial",
  } satisfies ProviderCapabilitySet,
};

export const PROVIDER_CAPABILITY_MATRIX = {
  alchemy: {
    ethereum: {
      capabilities: SUPPORT_LEVELS.walletOnly,
      notes:
        "Current integration is Ethereum-only and wallet activity is partial due to missing sale prices.",
    },
  },
  reservoir: {
    ethereum: {
      capabilities: SUPPORT_LEVELS.fullCollectionData,
      notes:
        "Current integration is pinned to the Ethereum Reservoir API host, but supports broad NFT-indexed endpoints on Ethereum.",
    },
  },
  opensea: {
    ethereum: {
      capabilities: SUPPORT_LEVELS.collectionOnly,
      notes:
        "Current integration focuses on collection discovery/metadata and does not expose wallet or orderbook history APIs.",
    },
  },
  simplehash: {
    ethereum: {
      capabilities: SUPPORT_LEVELS.metadataOnly,
      notes:
        "Current integration only enriches collection metadata and does not yet expose wallet or market data methods.",
    },
  },
  moralis: {},
  covalent: {},
} as const satisfies ProviderCapabilityMatrix;

function getChainProfile(provider: ProviderKey, chain: SupportedChainKey) {
  const providerMatrix =
    PROVIDER_CAPABILITY_MATRIX[provider] as Partial<
      Record<SupportedChainKey, ProviderChainCapabilityProfile>
    >;
  return providerMatrix[chain];
}

export function resolveProviderCapability(
  provider: ProviderKey,
  chain: SupportedChainKey,
  capability: ProviderCapabilityKey
): ProviderCapabilityLevel {
  return (
    getChainProfile(provider, chain)?.capabilities[capability] ?? "unsupported"
  );
}

export function resolveProviderCapabilities(
  provider: ProviderKey,
  chain: SupportedChainKey
): ProviderCapabilitySet {
  return (
    getChainProfile(provider, chain)?.capabilities ?? UNSUPPORTED_CAPABILITIES
  );
}

export function isProviderCapabilityUnsupported(
  provider: ProviderKey,
  chain: SupportedChainKey,
  capability: ProviderCapabilityKey
) {
  return resolveProviderCapability(provider, chain, capability) === "unsupported";
}

export function getProvidersForCapability(
  chain: SupportedChainKey,
  capability: ProviderCapabilityKey,
  minimumLevel: "supported" | "partial" = "partial"
): ProviderKey[] {
  const allowPartial = minimumLevel === "partial";

  return PROVIDER_KEYS.filter((provider) => {
    const level = resolveProviderCapability(provider, chain, capability);
    return level === "supported" || (allowPartial && level === "partial");
  });
}

export function listUnsupportedCapabilities(
  provider: ProviderKey,
  chain: SupportedChainKey
): ProviderCapabilityKey[] {
  const resolved = resolveProviderCapabilities(provider, chain);
  return PROVIDER_CAPABILITY_KEYS.filter(
    (capability) => resolved[capability] === "unsupported"
  );
}

export function hasCapabilityMatrixForEveryConfiguredChain() {
  return CHAIN_REGISTRY.every((chain) => SUPPORTED_CHAIN_KEYS.includes(chain.key));
}
