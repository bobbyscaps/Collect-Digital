import type { SupportedChainKey } from "@/lib/chains/registry";

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

export type ProviderCapabilitySet = Readonly<Record<
  ProviderCapabilityKey,
  ProviderCapabilityLevel
>>;

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

function withCapabilityOverrides(
  overrides: Partial<Record<ProviderCapabilityKey, ProviderCapabilityLevel>>
): ProviderCapabilitySet {
  return Object.freeze({
    ...UNSUPPORTED_CAPABILITIES,
    ...overrides,
  });
}

function cloneReadonlyCapabilities(
  capabilities: ProviderCapabilitySet
): ProviderCapabilitySet {
  return Object.freeze({ ...capabilities });
}

const SUPPORT_LEVELS = {
  unsupported: cloneReadonlyCapabilities(UNSUPPORTED_CAPABILITIES),
  walletOnly: withCapabilityOverrides({
    wallet_holdings: "supported",
    wallet_activity: "partial",
  }),
  collectionOnly: withCapabilityOverrides({
    floor_prices: "partial",
    collection_metadata: "supported",
  }),
  fullCollectionData: cloneReadonlyCapabilities({
    wallet_holdings: "supported",
    wallet_activity: "supported",
    floor_prices: "supported",
    collection_metadata: "supported",
    listings: "supported",
    offers: "supported",
    sales: "supported",
    historical_data: "supported",
  }),
  metadataOnly: withCapabilityOverrides({
    collection_metadata: "partial",
  }),
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
  const resolved =
    getChainProfile(provider, chain)?.capabilities ?? UNSUPPORTED_CAPABILITIES;
  return cloneReadonlyCapabilities(resolved);
}

export interface CapabilityMatrixValidationIssue {
  provider: ProviderKey;
  chain: SupportedChainKey;
  capability: ProviderCapabilityKey;
}

export function validateProviderCapabilityMatrix(): CapabilityMatrixValidationIssue[] {
  const issues: CapabilityMatrixValidationIssue[] = [];

  for (const provider of PROVIDER_KEYS) {
    for (const chain of Object.keys(PROVIDER_CAPABILITY_MATRIX[provider]) as SupportedChainKey[]) {
      const profile = getChainProfile(provider, chain);
      if (!profile) {
        continue;
      }
      for (const capability of PROVIDER_CAPABILITY_KEYS) {
        if (!profile.capabilities[capability]) {
          issues.push({ provider, chain, capability });
        }
      }
    }
  }

  return issues;
}

export interface CapabilityCoverageSummary {
  supported: number;
  partial: number;
  unsupported: number;
}

export function summarizeChainCapabilityCoverage(
  chain: SupportedChainKey
): CapabilityCoverageSummary {
  const summary: CapabilityCoverageSummary = {
    supported: 0,
    partial: 0,
    unsupported: 0,
  };

  for (const provider of PROVIDER_KEYS) {
    for (const capability of PROVIDER_CAPABILITY_KEYS) {
      const level = resolveProviderCapability(provider, chain, capability);
      summary[level] += 1;
    }
  }

  return summary;
}

export function hasAnyProviderCapabilitySupport(chain: SupportedChainKey): boolean {
  const coverage = summarizeChainCapabilityCoverage(chain);
  return coverage.supported > 0 || coverage.partial > 0;
}

export function listChainsWithoutAnyCapabilitySupport(
  chains: readonly SupportedChainKey[]
): SupportedChainKey[] {
  return chains.filter((chain) => !hasAnyProviderCapabilitySupport(chain));
}

export function listProvidersWithoutConfiguredChains(): ProviderKey[] {
  return PROVIDER_KEYS.filter(
    (provider) => Object.keys(PROVIDER_CAPABILITY_MATRIX[provider]).length === 0
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
