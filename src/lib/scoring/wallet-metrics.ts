import { env } from "@/lib/env";
import { AlchemyProvider } from "@/providers/alchemy/provider";
import { ReservoirProvider } from "@/providers/reservoir/provider";
import type {
  NormalizedHeldToken,
  NormalizedWalletActivity,
} from "@/providers/types";
import type { WalletBehaviorMetrics } from "@/lib/types";

const DAY_MS = 1000 * 60 * 60 * 24;

// A small set of blue-chip collection contracts (lowercased) used as a quality
// signal. Reservoir returns collection ids as contract addresses.
const BLUE_CHIP_CONTRACTS = new Set(
  [
    "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // Bored Ape Yacht Club
    "0x60e4d786628fea6478f785a6d7e704777c86a7c6", // Mutant Ape Yacht Club
    "0xed5af388653567af2f388e6224dc7c4b3241c544", // Azuki
    "0xbd3531da5cf5857e7cfaa92426877b022e612cf8", // Pudgy Penguins
    "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e", // Doodles
    "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b", // CloneX
    "0x23581767a106ae21c074b2276d25e5c3e136a68b", // Moonbirds
    "0x5af0d9827e0c53e4799bb226655a1de152a425a5", // Milady Maker
    "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7", // Meebits
    "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb", // CryptoPunks (v1 wrapper)
  ].map((c) => c.toLowerCase())
);

export function isEthAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((acc, value) => acc + value, 0) / values.length
    : 0;
}

function pct(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

/**
 * Derive real wallet behavior metrics from on-chain history. Uses Alchemy
 * (requires ALCHEMY_API_KEY) as the primary source, with Reservoir as a
 * best-effort secondary. Returns null when no history is reachable (e.g. no API
 * key configured) so callers can fall back to synthetic metrics.
 *
 * Note: Alchemy transfers do not carry sale prices, so trading volume and
 * realized PnL are only populated when the secondary priced source is available.
 *
 * Dimensions that are reliably derivable from transfers/holdings are real:
 * wallet age, buy/sell/mint counts, holding periods, activity/turnover, trading
 * volume, portfolio value, diversity, ecosystem concentration, blue-chip count,
 * and a floor/blue-chip based collection-quality proxy.
 *
 * A few dimensions cannot be derived from this data yet and use documented,
 * neutral placeholders: pre-pump buy rate and sell-into-pump rate (need
 * per-trade price-vs-floor timing) and community participation (off-chain).
 * Realized PnL is approximated as net trade flow (sell volume − buy volume).
 */
export async function deriveWalletMetrics(
  address: string
): Promise<WalletBehaviorMetrics | null> {
  if (!isEthAddress(address)) return null;

  const wallet = address.toLowerCase();
  const alchemy = new AlchemyProvider(env.ALCHEMY_API_KEY);
  const reservoir = new ReservoirProvider(env.RESERVOIR_API_KEY);

  let holdings: NormalizedHeldToken[] = [];
  let activity: NormalizedWalletActivity[] = [];
  try {
    [holdings, activity] = await Promise.all([
      alchemy.getUserTokens(wallet, { limit: 200 }),
      alchemy.getUserActivity(wallet),
    ]);
    if (holdings.length === 0 && activity.length === 0) {
      [holdings, activity] = await Promise.all([
        reservoir.getUserTokens(wallet, { limit: 200 }),
        reservoir.getUserActivity(wallet, { limit: 500 }),
      ]);
    }
  } catch {
    return null;
  }

  if (holdings.length === 0 && activity.length === 0) {
    return null;
  }

  const now = Date.now();

  // Provider-agnostic: a "buy"/acquisition is an inbound non-mint transfer, a
  // "sell"/disposal is an outbound transfer, and a mint is from the zero address.
  const buys = activity.filter(
    (event) => event.toAddress === wallet && event.type !== "mint"
  );
  const sells = activity.filter((event) => event.fromAddress === wallet);
  const userMints = activity.filter(
    (event) => event.type === "mint" && event.toAddress === wallet
  );

  const timestamps = [
    ...activity.map((event) => event.timestamp),
    ...holdings.map((token) => token.acquiredAt),
  ].filter((value) => value > 0);
  const earliest = timestamps.length ? Math.min(...timestamps) : now;
  const walletAgeDays = Math.max(0, (now - earliest) / DAY_MS);
  const walletAgeMonths = Math.max(walletAgeDays / 30, 1);

  const holdAges = holdings
    .map((token) => (token.acquiredAt > 0 ? (now - token.acquiredAt) / DAY_MS : null))
    .filter((value): value is number => value !== null && value >= 0);

  const avgHoldDays = mean(holdAges);
  const heldOver = (days: number) =>
    pct(holdAges.filter((age) => age >= days).length, holdAges.length);

  const buyVolume = buys.reduce((acc, event) => acc + event.priceEth, 0);
  const sellVolume = sells.reduce((acc, event) => acc + event.priceEth, 0);

  const heldCollectionIds = new Set(
    holdings.map((token) => token.collectionId.toLowerCase())
  );
  const tradedCollectionIds = new Set(
    activity
      .map((event) => event.collectionId?.toLowerCase())
      .filter((id): id is string => Boolean(id))
  );
  const collectionsFullyExited = Array.from(tradedCollectionIds).filter(
    (id) => !heldCollectionIds.has(id)
  ).length;

  const perCollectionCounts = new Map<string, number>();
  for (const token of holdings) {
    const id = token.collectionId.toLowerCase();
    perCollectionCounts.set(id, (perCollectionCounts.get(id) ?? 0) + 1);
  }
  const largestCollection = Math.max(0, ...perCollectionCounts.values());
  const ecosystemConcentrationPct = holdings.length
    ? largestCollection / holdings.length
    : 0;
  const diversityScore = holdings.length
    ? clamp01(heldCollectionIds.size / holdings.length)
    : 0;

  const blueChipCount = holdings.filter((token) =>
    BLUE_CHIP_CONTRACTS.has(token.collectionId.toLowerCase())
  ).length;
  const avgFloor = mean(holdings.map((token) => token.floorEth));
  const collectionQualityScore = clamp01(
    0.6 * (holdings.length ? blueChipCount / holdings.length : 0) +
      0.4 * Math.min(avgFloor / 3, 1)
  );

  return {
    walletAddress: wallet,
    walletAgeDays: Math.round(walletAgeDays),
    avgHoldDays: Math.round(avgHoldDays),
    boughtCount: buys.length,
    soldCount: sells.length,
    mintCount: userMints.length,
    saleFrequencyPerMonth: Number((sells.length / walletAgeMonths).toFixed(2)),
    realizedPnlEth: Number((sellVolume - buyVolume).toFixed(2)),
    unrealizedValueEth: Number(
      holdings.reduce((acc, token) => acc + token.floorEth, 0).toFixed(2)
    ),
    heldOver30Pct: Math.round(heldOver(30)),
    heldOver90Pct: Math.round(heldOver(90)),
    heldOver180Pct: Math.round(heldOver(180)),
    heldOver365Pct: Math.round(heldOver(365)),
    blueChipCount,
    // Not derivable from transfer/holdings data yet — neutral placeholders.
    sellIntoPumpRate: 0.5,
    prePumpBuyRate: 0.5,
    tradingVolumeEth: Number((buyVolume + sellVolume).toFixed(2)),
    diversityScore: Number(diversityScore.toFixed(2)),
    ecosystemConcentrationPct: Number(ecosystemConcentrationPct.toFixed(2)),
    collectionsFullyExited,
    collectionsStillHeld: heldCollectionIds.size,
    communityParticipationScore: 0.5,
    collectionQualityScore: Number(collectionQualityScore.toFixed(2)),
  };
}
