import type { CollectorIdentityAssetData } from "@/lib/collector-identity/api-models";
import type { WalletChainNamespace } from "@/lib/profile-wallets/domain";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";

const RESERVOIR_BASE_URL = "https://api.reservoir.tools";
const TOKEN_BATCH_SIZE = 20;

type TraitFloor = NonNullable<CollectorIdentityAssetData["topTraitFloor"]>;

interface AssetMetadata {
  listedPriceEth: number | null;
  highestOfferEth: number | null;
  rarityRank: number | null;
  name: string | null;
  imageUrl: string | null;
  collectionName: string | null;
  collectionFloorPriceEth: number | null;
  topTraitFloor: TraitFloor | null;
  openseaUrl: string | null;
}

interface CollectionMetadata {
  name: string | null;
  floorPriceEth: number | null;
}

export interface CollectorIdentityAssetService {
  buildAssets(
    holdings: readonly NormalizedHolding[]
  ): Promise<readonly CollectorIdentityAssetData[]>;
}

function toAssetKey(holding: Pick<NormalizedHolding, "chainNamespace" | "contractAddress" | "tokenId">) {
  return `${holding.chainNamespace}:${normalizeContractForAssetKey(
    holding.chainNamespace,
    holding.contractAddress
  )}:${normalizeTokenId(holding.tokenId)}`;
}

function normalizeTokenId(tokenId: string) {
  const value = tokenId.trim();
  if (!value) return tokenId;
  if (/^0x[0-9a-f]+$/i.test(value)) {
    try {
      return BigInt(value).toString(10);
    } catch {
      return value.toLowerCase();
    }
  }
  return value;
}

export function normalizeMediaUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/ipfs/")) return `https://ipfs.io${trimmed}`;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("ipfs://")) {
    const value = trimmed.slice("ipfs://".length).replace(/^ipfs\//i, "");
    return value ? `https://ipfs.io/ipfs/${value}` : null;
  }
  if (trimmed.startsWith("ar://")) {
    const value = trimmed.slice("ar://".length);
    return value ? `https://arweave.net/${value}` : null;
  }
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}(\/.*)?$/.test(trimmed)) {
    return `https://ipfs.io/ipfs/${trimmed}`;
  }
  return null;
}

function toCollectionContractAddress(holding: NormalizedHolding) {
  const collectionId = holding.collectionId?.trim();
  if (!collectionId || collectionId.startsWith("asset:")) {
    return holding.contractAddress;
  }
  const separator = collectionId.indexOf(":");
  if (separator <= 0 || separator === collectionId.length - 1) {
    return holding.contractAddress;
  }
  const namespace = collectionId.slice(0, separator);
  if (namespace !== "eip155" && namespace !== "solana") {
    return holding.contractAddress;
  }
  return collectionId.slice(separator + 1);
}

function toOpenSeaChain(chainNamespace: WalletChainNamespace) {
  if (chainNamespace === "solana") {
    return "solana";
  }
  return "ethereum";
}

function buildOpenSeaAssetUrl(
  chainNamespace: WalletChainNamespace,
  contractAddress: string,
  tokenId: string
) {
  return `https://opensea.io/assets/${toOpenSeaChain(
    chainNamespace
  )}/${contractAddress}/${encodeURIComponent(tokenId)}`;
}

function normalizeContractForAssetKey(
  chainNamespace: WalletChainNamespace,
  contractAddress: string
) {
  if (chainNamespace === "eip155") {
    return contractAddress.toLowerCase();
  }
  return contractAddress;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNumberAtPath(
  source: Record<string, unknown> | null,
  path: readonly string[]
): number | null {
  let current: unknown = source;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return asNumber(current);
}

function asStringAtPath(
  source: Record<string, unknown> | null,
  path: readonly string[]
): string | null {
  let current: unknown = source;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return asString(current);
}

function parseTopTraitFloor(attributes: unknown): TraitFloor | null {
  if (!Array.isArray(attributes)) return null;

  let topTrait: TraitFloor | null = null;
  for (const attribute of attributes) {
    const record = asRecord(attribute);
    if (!record) continue;
    const floorPriceEth =
      asNumberAtPath(record, ["floorAskPrice", "amount", "native"]) ??
      asNumberAtPath(record, ["floorAsk", "price", "amount", "native"]) ??
      asNumber(record.floorAskPrice) ??
      asNumber(record.floorSellValue);
    if (floorPriceEth == null) continue;
    if (topTrait && topTrait.floorPriceEth >= floorPriceEth) continue;

    topTrait = Object.freeze({
      traitType: asString(record.key) ?? asString(record.trait_type),
      traitValue:
        asString(record.value) ??
        asString(record.valueString) ??
        asString(record.displayValue),
      floorPriceEth,
    });
  }

  return topTrait;
}

function parseTokenMetadata(entry: unknown): {
  tokenKey: string | null;
  metadata: AssetMetadata;
} | null {
  const entryRecord = asRecord(entry);
  const token = asRecord(entryRecord?.token);
  if (!token) return null;

  const chainName =
    asString(token.chain) ??
    asString(asRecord(token.chain)?.name) ??
    "ethereum";
  const contractAddress =
    asString(token.contract) ??
    asString(token.contractAddress) ??
    asStringAtPath(token, ["collection", "primaryContract"]);
  const tokenId = asString(token.tokenId);

  if (!contractAddress || !tokenId) return null;

  const collection = asRecord(token.collection);
  const market = asRecord(entryRecord?.market);
  const listedPriceEth =
    asNumberAtPath(market, ["floorAsk", "price", "amount", "native"]) ??
    asNumberAtPath(token, ["floorAskPrice", "amount", "native"]) ??
    null;
  const highestOfferEth =
    asNumberAtPath(market, ["topBid", "price", "amount", "native"]) ??
    asNumberAtPath(token, ["topBid", "price", "amount", "native"]) ??
    null;
  const collectionFloor =
    asNumberAtPath(collection, ["floorAskPrice", "amount", "native"]) ??
    listedPriceEth ??
    asNumberAtPath(token, ["floorAskPrice", "amount", "native"]) ??
    asNumberAtPath(token, ["lastSale", "price", "amount", "native"]);
  const rarityRank =
    asNumber(token.rarityRank) ??
    asNumberAtPath(token, ["rarity", "rank"]) ??
    asNumberAtPath(token, ["tokenRarity", "rank"]) ??
    null;

  const chainNamespace = chainName === "solana" ? "solana" : "eip155";
  const tokenKey = `${chainNamespace}:${normalizeContractForAssetKey(
    chainNamespace,
    contractAddress
  )}:${normalizeTokenId(tokenId)}`;

  return {
    tokenKey,
    metadata: {
      listedPriceEth,
      highestOfferEth,
      rarityRank,
      name: asString(token.name),
      imageUrl: normalizeMediaUrl(
        asString(token.image) ??
          asString(token.imageSmall) ??
          asString(token.imageUrl) ??
          asString(token.media) ??
          asStringAtPath(token, ["metadata", "image"]) ??
          asStringAtPath(token, ["metadata", "image_url"]) ??
          null
      ),
      collectionName: asString(collection?.name),
      collectionFloorPriceEth: collectionFloor,
      topTraitFloor: parseTopTraitFloor(token.attributes),
      openseaUrl:
        asString(token.openseaUrl) ??
        asStringAtPath(token, ["metadata", "openseaUrl"]) ??
        null,
    },
  };
}

async function fetchReservoirJson<T>(
  path: string,
  apiKey?: string
): Promise<T | null> {
  try {
    const response = await fetch(`${RESERVOIR_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      next: { revalidate: 180 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTokenMetadata(
  holdings: readonly NormalizedHolding[],
  apiKey?: string
): Promise<Map<string, AssetMetadata>> {
  const uniqueTokens = Array.from(
    new Set(
      holdings.map((holding) => `${holding.contractAddress}:${normalizeTokenId(holding.tokenId)}`)
    )
  );
  const metadataByKey = new Map<string, AssetMetadata>();

  for (let index = 0; index < uniqueTokens.length; index += TOKEN_BATCH_SIZE) {
    const batch = uniqueTokens.slice(index, index + TOKEN_BATCH_SIZE);
    const query = batch
      .map((token) => `tokens=${encodeURIComponent(token)}`)
      .join("&");
    const payload = await fetchReservoirJson<{ tokens?: unknown[] }>(
      `/tokens/v7?includeAttributes=true&includeTopBid=true&limit=${batch.length}&${query}`,
      apiKey
    );
    if (!payload?.tokens?.length) continue;

    for (const item of payload.tokens) {
      const parsed = parseTokenMetadata(item);
      if (!parsed || !parsed.tokenKey) continue;
      metadataByKey.set(parsed.tokenKey, parsed.metadata);
    }
  }

  return metadataByKey;
}

async function fetchCollectionMetadata(
  collectionContracts: readonly string[],
  apiKey?: string
): Promise<Map<string, CollectionMetadata>> {
  const metadataByContract = new Map<string, CollectionMetadata>();
  const settled = await Promise.allSettled(
    collectionContracts.map((contractAddress) =>
      fetchReservoirJson<{ collections?: unknown[] }>(
        `/collections/v7?contract=${encodeURIComponent(contractAddress)}&limit=1`,
        apiKey
      )
    )
  );

  settled.forEach((result, index) => {
    if (result.status !== "fulfilled" || !result.value?.collections?.length) return;
    const collection = asRecord(result.value.collections[0]);
    const metadata: CollectionMetadata = {
      name: asString(collection?.name),
      floorPriceEth:
        asNumberAtPath(collection, ["floorAsk", "price", "amount", "native"]) ??
        asNumber(collection?.floorSellValue),
    };
    metadataByContract.set(collectionContracts[index], metadata);
  });

  return metadataByContract;
}

export function createCollectorIdentityAssetService(options: {
  reservoirApiKey?: string;
  enableRemoteFetch?: boolean;
} = {}): CollectorIdentityAssetService {
  const enableRemoteFetch = options.enableRemoteFetch ?? true;

  return {
    async buildAssets(
      holdings: readonly NormalizedHolding[]
    ): Promise<readonly CollectorIdentityAssetData[]> {
      const deduped = new Map<string, NormalizedHolding>();
      for (const holding of holdings) {
        const key = toAssetKey(holding);
        if (!deduped.has(key)) {
          deduped.set(key, holding);
        }
      }

      if (deduped.size === 0) {
        return Object.freeze([]);
      }

      const holdingsByAsset = Array.from(deduped.entries());
      const [tokenMetadataByKey, collectionMetadataByContract] = enableRemoteFetch
        ? await Promise.all([
            fetchTokenMetadata(
              holdingsByAsset.map(([, holding]) => holding),
              options.reservoirApiKey
            ),
            fetchCollectionMetadata(
              Array.from(
                new Set(
                  holdingsByAsset.map(([, holding]) =>
                    toCollectionContractAddress(holding)
                  )
                )
              ),
              options.reservoirApiKey
            ),
          ])
        : [new Map<string, AssetMetadata>(), new Map<string, CollectionMetadata>()];

      const assets = holdingsByAsset
        .map(([assetKey, holding]) => {
          const tokenMetadata = tokenMetadataByKey.get(assetKey);
          const collectionMetadata = collectionMetadataByContract.get(
            toCollectionContractAddress(holding)
          );
          const tokenId = normalizeTokenId(holding.tokenId);

          return Object.freeze({
            assetId: assetKey,
            chainNamespace: holding.chainNamespace,
            contractAddress: holding.contractAddress,
            tokenId,
            receivedAt: holding.acquiredAt,
            listedPriceEth: tokenMetadata?.listedPriceEth ?? null,
            highestOfferEth: tokenMetadata?.highestOfferEth ?? null,
            rarityRank: tokenMetadata?.rarityRank ?? null,
            name: tokenMetadata?.name ?? null,
            imageUrl: tokenMetadata?.imageUrl ?? null,
            collectionName:
              tokenMetadata?.collectionName ?? collectionMetadata?.name ?? null,
            collectionFloorPriceEth:
              tokenMetadata?.collectionFloorPriceEth ??
              collectionMetadata?.floorPriceEth ??
              null,
            topTraitFloor: tokenMetadata?.topTraitFloor ?? null,
            openseaUrl:
              tokenMetadata?.openseaUrl ??
              buildOpenSeaAssetUrl(
                holding.chainNamespace,
                holding.contractAddress,
                tokenId
              ),
          } satisfies CollectorIdentityAssetData);
        })
        .sort((left, right) => {
          const byCollection = (left.collectionName ?? "").localeCompare(
            right.collectionName ?? ""
          );
          if (byCollection !== 0) return byCollection;
          const byName = (left.name ?? "").localeCompare(right.name ?? "");
          if (byName !== 0) return byName;
          return left.assetId.localeCompare(right.assetId);
        });

      return Object.freeze(assets);
    },
  };
}
