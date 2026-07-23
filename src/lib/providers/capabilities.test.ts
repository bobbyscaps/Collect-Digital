import assert from "node:assert/strict";
import test from "node:test";

import {
  getProvidersForCapability,
  isProviderCapabilityUnsupported,
  listUnsupportedCapabilities,
  PROVIDER_CAPABILITY_KEYS,
  PROVIDER_KEYS,
  resolveProviderCapabilities,
  resolveProviderCapability,
} from "./capabilities";

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
    assert.deepEqual(Object.keys(snapshot).sort(), [...PROVIDER_CAPABILITY_KEYS].sort());
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
