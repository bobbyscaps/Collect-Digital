import type {
  SupportedChainId,
  SupportedChainKey,
} from "@/lib/chains/registry";
import type { ProviderKey } from "@/lib/providers/capabilities";

export type ProviderName = "reservoir" | "alchemy" | "opensea" | "simplehash";

export interface ProviderCollectionMetadata {
  description?: string | null;
  bannerImage?: string | null;
  website?: string | null;
  xUrl?: string | null;
  discordUrl?: string | null;
  telegramUrl?: string | null;
  openseaUrl?: string | null;
  contractAddress?: string | null;
  chain?: string | null;
}

export interface NormalizedCollection {
  id: string;
  slug: string;
  name: string;
  image: string;
  floor: number;
  topOffer: number;
  holders: number;
  sales: number;
  liquidity: number;
  listedPercent: number;
  volume: number;
  metadata: ProviderCollectionMetadata;
  provider: ProviderName;
}

export interface NormalizedListing {
  tokenId: string;
  priceEth: number;
  marketplace?: string;
  maker?: string;
  createdAt?: string;
}

export interface NormalizedOffer {
  tokenId?: string;
  priceEth: number;
  marketplace?: string;
  maker?: string;
  createdAt?: string;
}

export interface NormalizedSale {
  tokenId: string;
  priceEth: number;
  marketplace?: string;
  txHash?: string;
  soldAt?: string;
}

export interface NormalizedHistoricalPoint {
  timestamp: string;
  floorPriceEth: number;
  volumeEth: number;
  salesCount: number;
}

export interface NormalizedHeldToken {
  collectionId: string;
  collectionName: string;
  acquiredAt: number;
  floorEth: number;
  /**
   * Multi-chain context (optional for legacy compatibility; required by
   * chain-aware orchestration contracts).
   */
  chain?: SupportedChainKey;
  chainId?: SupportedChainId;
  contractAddress?: string;
  tokenId?: string;
  provider?: ProviderKey;
  observedAt?: number;
}

export type WalletActivityDirection =
  | "inbound"
  | "outbound"
  | "self"
  | "unknown";

export interface NormalizedWalletActivity {
  type: string;
  timestamp: number;
  priceEth: number;
  fromAddress?: string;
  toAddress?: string;
  collectionId?: string;
  /**
   * Multi-chain context (optional for legacy compatibility; required by
   * chain-aware orchestration contracts).
   */
  chain?: SupportedChainKey;
  chainId?: SupportedChainId;
  txHash?: string;
  logIndex?: number;
  blockNumber?: number;
  /**
   * Stable dedup key format for future multi-chain aggregation:
   * `${chain}:${txHash}:${logIndexOrZero}` with lowercase hex tx hash and a
   * numeric `logIndexOrZero` fallback of `0` when unavailable.
   */
  eventId?: string;
  provider?: ProviderKey;
  direction?: WalletActivityDirection;
}

export interface ChainAwareNormalizedHeldToken extends NormalizedHeldToken {
  chain: SupportedChainKey;
  chainId: SupportedChainId;
  contractAddress: string;
  provider: ProviderKey;
  observedAt: number;
}

export interface ChainAwareNormalizedWalletActivity
  extends NormalizedWalletActivity {
  chain: SupportedChainKey;
  chainId: SupportedChainId;
  txHash: string;
  /**
   * Stable dedup key format for future multi-chain aggregation:
   * `${chain}:${txHash}:${logIndexOrZero}` with lowercase hex tx hash and a
   * numeric `logIndexOrZero` fallback of `0` when unavailable.
   */
  eventId: string;
  provider: ProviderKey;
  direction: WalletActivityDirection;
}

export interface NormalizedWalletNft {
  contractAddress: string;
  tokenId: string;
  collectionId: string;
  collectionSlug: string;
  collectionName: string;
  image?: string;
  quantity: number;
}

export interface NormalizedPortfolioValue {
  floorValueEth: number;
  offerValueEth: number;
  conservativeLiquidationEth: number;
}

export interface NormalizedWalletCollection {
  collectionId: string;
  collectionSlug: string;
  collectionName: string;
  quantity: number;
  floorValueEth: number;
  offerValueEth: number;
}

export interface NormalizedWallet {
  address: string;
  portfolioValueFloor: number;
  portfolioValueOffer: number;
  collectorScore: number;
  flipperScore: number;
  collections: NormalizedWalletCollection[];
  alerts: string[];
}

export interface ProviderQueryOptions {
  limit?: number;
  timeframe?: "24h" | "7d" | "30d" | "all";
}

export interface NftDataProvider {
  readonly name: ProviderName;
  getCollection(collectionId: string): Promise<NormalizedCollection | null>;
  searchCollections(
    query: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedCollection[]>;
  getCollectionStats(collectionId: string): Promise<NormalizedCollection | null>;
  getFloorPrice(collectionId: string): Promise<number | null>;
  getListings(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedListing[]>;
  getOffers(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedOffer[]>;
  getSales(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedSale[]>;
  getWalletNFTs(
    walletAddress: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedWalletNft[]>;
  getPortfolioValue(
    walletAddress: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedPortfolioValue | null>;
  getHistoricalData(
    collectionId: string,
    options?: ProviderQueryOptions
  ): Promise<NormalizedHistoricalPoint[]>;
}
