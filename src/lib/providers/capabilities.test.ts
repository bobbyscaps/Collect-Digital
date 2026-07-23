import assert from "node:assert/strict";
import test from "node:test";

import {
  getProvidersForCapability,
  hasAnyProviderCapabilitySupport,
  isProviderCapabilityUnsupported,
  listChainsWithoutAnyCapabilitySupport,
  listProvidersWithoutConfiguredChains,
  listUnsupportedCapabilities,
  PROVIDER_CAPABILITY_KEYS,
  PROVIDER_KEYS,
  resolveProviderCapabilities,
  resolveProviderCapability,
  summarizeChainCapabilityCoverage,
  validateProviderCapabilityMatrix,
} from "./capabilities";
import { SUPPORTED_CHAIN_KEYS } from "@/lib/chains/registry";

test("provider capability resolution returns configured support levels", () => {
  assert.equal(
    resolveProviderCapability("reservoir", "ethereum", "sales"),
    "supported"
  );
  assert.equal(
    resolveProviderCapability("alchemy", "ethereum", "wallet_activity"),
    "partial"
  );
  assert.equal(
    resolveProviderCapability("opensea", "ethereum", "wallet_holdings"),
    "unsupported"
  );
});

test("unsupported capability detection is explicit for non-integrated chains", () => {
  assert.equal(
    isProviderCapabilityUnsupported("alchemy", "base", "wallet_holdings"),
    true
  );
  assert.equal(
    isProviderCapabilityUnsupported("reservoir", "polygon", "sales"),
    true
  );
});

test("provider capability snapshots include every capability key", () => {
  for (const provider of PROVIDER_KEYS) {
    const snapshot = resolveProviderCapabilities(provider, "ethereum");
    assert.deepEqual(
      Object.keys(snapshot).sort(),
      [...PROVIDER_CAPABILITY_KEYS].sort()
    );
  }
});

test("provider resolution can include or exclude partial support", () => {
  assert.deepEqual(getProvidersForCapability("ethereum", "wallet_activity"), [
    "alchemy",
    "reservoir",
  ]);
  assert.deepEqual(
    getProvidersForCapability("ethereum", "wallet_activity", "supported"),
    ["reservoir"]
  );
});

test("unsupported capability listing exposes unimplemented surfaces", () => {
  const unsupported = listUnsupportedCapabilities("simplehash", "ethereum");
  assert.ok(unsupported.includes("wallet_holdings"));
  assert.ok(unsupported.includes("sales"));
  assert.ok(!unsupported.includes("collection_metadata"));
});

test("resolved capability sets are immutable snapshots, not shared mutable defaults", () => {
  const a = resolveProviderCapabilities("alchemy", "base");
  const b = resolveProviderCapabilities("alchemy", "base");

  assert.notStrictEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(b), true);
  assert.throws(() => {
    (a as { wallet_holdings: string }).wallet_holdings = "supported";
  });
});

test("matrix validation returns no structural capability gaps", () => {
  assert.deepEqual(validateProviderCapabilityMatrix(), []);
});

test("coverage helpers expose meaningful unsupported-chain and empty-provider signals", () => {
  assert.equal(hasAnyProviderCapabilitySupport("ethereum"), true);
  assert.equal(hasAnyProviderCapabilitySupport("base"), false);

  assert.deepEqual(
    listChainsWithoutAnyCapabilitySupport(SUPPORTED_CHAIN_KEYS),
    [
      "base",
      "abstract",
      "apechain",
      "robinhood",
      "polygon",
      "arbitrum",
      "optimism",
    ]
  );

  assert.deepEqual(listProvidersWithoutConfiguredChains(), [
    "moralis",
    "covalent",
  ]);

  assert.deepEqual(summarizeChainCapabilityCoverage("base"), {
    supported: 0,
    partial: 0,
    unsupported: PROVIDER_KEYS.length * PROVIDER_CAPABILITY_KEYS.length,
  });
});
