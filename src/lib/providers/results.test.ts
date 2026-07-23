import assert from "node:assert/strict";
import test from "node:test";

import { isSupportedChainKey } from "@/lib/chains/registry";
import { isProviderKey } from "@/lib/providers/capabilities";
import {
  createProviderResult,
  isProviderFailureResult,
  isProviderResultStatus,
  isProviderSuccessLikeResult,
  isProviderUnsupportedResult,
} from "./results";

test("provider result statuses discriminate success/empty/failure/unsupported", () => {
  const success = createProviderResult({
    status: "success",
    data: [1, 2],
    provider: "alchemy",
    chain: "ethereum",
  });
  const empty = createProviderResult({
    status: "empty",
    data: [],
    provider: "reservoir",
    chain: "ethereum",
  });
  const failure = createProviderResult({
    status: "failure",
    data: [],
    provider: "opensea",
    chain: "ethereum",
    error: {
      category: "network",
      message: "upstream timeout",
      retryable: true,
      rateLimited: false,
    },
  });
  const unsupported = createProviderResult({
    status: "unsupported",
    data: [],
    provider: "covalent",
    chain: "base",
    error: {
      category: "unsupported",
      message: "adapter missing",
      retryable: false,
      rateLimited: false,
    },
  });

  assert.equal(isProviderSuccessLikeResult(success), true);
  assert.equal(isProviderSuccessLikeResult(empty), true);
  assert.equal(isProviderSuccessLikeResult(failure), false);
  assert.equal(isProviderFailureResult(failure), true);
  assert.equal(isProviderUnsupportedResult(unsupported), true);
  if (!isProviderUnsupportedResult(unsupported)) {
    assert.fail("Expected unsupported result type guard to narrow correctly.");
  }
  assert.equal(unsupported.error.category, "unsupported");
});

test("provider envelopes are immutable snapshots", () => {
  const result = createProviderResult({
    status: "partial",
    data: { count: 2 },
    provider: "alchemy",
    chain: "ethereum",
    diagnostics: {
      rateLimited: false,
      paginationTruncated: true,
      cacheState: "miss",
    },
    error: {
      category: "rate_limit",
      message: "upstream 429",
      retryable: true,
      rateLimited: true,
    },
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
  assert.equal(Object.isFrozen(result.error), true);
  assert.throws(() => {
    (result as { status: string }).status = "failure";
  });
});

test("chain and provider typing guards accept only supported values", () => {
  assert.equal(isSupportedChainKey("ethereum"), true);
  assert.equal(isSupportedChainKey("not-a-chain"), false);
  assert.equal(isProviderKey("alchemy"), true);
  assert.equal(isProviderKey("not-a-provider"), false);
});

test("provider status guard rejects synthetic and unknown statuses", () => {
  assert.equal(isProviderResultStatus("success"), true);
  assert.equal(isProviderResultStatus("partial"), true);
  assert.equal(isProviderResultStatus("synthetic"), false);
  assert.equal(isProviderResultStatus("anything-else"), false);
});
