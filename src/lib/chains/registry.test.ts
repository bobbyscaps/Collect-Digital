import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_REGISTRY,
  getChainConfig,
  hasUniqueChainIds,
  listConfiguredChains,
  listEnabledChains,
  SUPPORTED_CHAIN_KEYS,
} from "./registry";

test("registry includes the required initial chains", () => {
  assert.deepEqual(SUPPORTED_CHAIN_KEYS, [
    "ethereum",
    "base",
    "abstract",
    "apechain",
    "robinhood",
    "polygon",
    "arbitrum",
    "optimism",
  ]);
});

test("every chain ID is unique", () => {
  assert.equal(hasUniqueChainIds(), true);
  assert.equal(new Set(CHAIN_REGISTRY.map((chain) => chain.chainId)).size, CHAIN_REGISTRY.length);
});

test("enabled chains can be listed independently", () => {
  assert.equal(listEnabledChains().length, CHAIN_REGISTRY.length);
  assert.equal(listConfiguredChains().length, CHAIN_REGISTRY.length);
});

test("chain lookup resolves each configured key", () => {
  for (const key of SUPPORTED_CHAIN_KEYS) {
    const chain = getChainConfig(key);
    assert.ok(chain);
    assert.equal(chain.key, key);
  }
});
