import assert from "node:assert/strict";
import test from "node:test";

import { MOCK_WALLET_METRICS } from "@/lib/mock-data";
import { createProviderResult } from "@/lib/providers/results";
import {
  createWalletMetricsDerivationResult,
  isWalletMetricsDerivationLiveDataStatus,
  isWalletMetricsDerivationStatus,
} from "./wallet-result-contracts";

test("derivation status guard discriminates valid values", () => {
  assert.equal(isWalletMetricsDerivationStatus("ok"), true);
  assert.equal(isWalletMetricsDerivationStatus("partial"), true);
  assert.equal(isWalletMetricsDerivationStatus("empty_wallet"), true);
  assert.equal(isWalletMetricsDerivationStatus("synthetic"), false);
  assert.equal(isWalletMetricsDerivationStatus("fallback"), false);
});

test("per-chain derivation result keeps raw data separate and immutable", () => {
  const result = createWalletMetricsDerivationResult({
    status: "partial",
    overallMetrics: { ...MOCK_WALLET_METRICS, walletAddress: "0xabc" },
    perChain: [
      {
        chain: "ethereum",
        chainId: 1,
        status: "ok",
        raw: {
          holdings: [
            {
              collectionId: "0x1",
              collectionName: "Collection",
              acquiredAt: 100,
              floorEth: 1.5,
              chain: "ethereum",
              chainId: 1,
              contractAddress: "0x1",
              provider: "alchemy",
              observedAt: 1000,
            },
          ],
          activity: [
            {
              type: "transfer",
              timestamp: 100,
              priceEth: 0,
              chain: "ethereum",
              chainId: 1,
              txHash: "0xtx",
              eventId: "ethereum:0xtx:0",
              provider: "alchemy",
              direction: "inbound",
            },
          ],
        },
        providerAttempts: [
          createProviderResult({
            status: "success",
            data: [1],
            provider: "alchemy",
            chain: "ethereum",
          }),
        ],
        coverage: { holdings: "complete", activity: "complete" },
      },
    ],
    diagnostics: {
      hasProviderFailures: false,
      chainsRequested: 8,
      chainsReported: 1,
      partialChains: 1,
    },
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.perChain.length, 1);
  assert.equal(result.perChain[0].chain, "ethereum");
  assert.equal(result.perChain[0].raw.holdings.length, 1);
  assert.equal(result.perChain[0].raw.activity.length, 1);
  assert.equal(Object.isFrozen(result.perChain), true);
  assert.equal(Object.isFrozen(result.perChain[0].raw), true);
  assert.throws(() => {
    (result.perChain as unknown as Array<unknown>).push({});
  });
});

test("live-data status helper never implies synthetic requirements", () => {
  assert.equal(isWalletMetricsDerivationLiveDataStatus("ok"), true);
  assert.equal(isWalletMetricsDerivationLiveDataStatus("partial"), true);
  assert.equal(isWalletMetricsDerivationLiveDataStatus("provider_failure"), true);
  assert.equal(isWalletMetricsDerivationLiveDataStatus("invalid_address"), false);
});
