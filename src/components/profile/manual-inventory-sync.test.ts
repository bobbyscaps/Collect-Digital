import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";
import {
  buildManualInventorySyncFeedback,
  canShowSyncCollectiblesAction,
  getSyncCollectiblesButtonLabel,
  getVerifiedWalletIdsForSync,
  isSyncCollectiblesButtonDisabled,
  syncVerifiedWalletInventories,
} from "@/components/profile/manual-inventory-sync";

function identityWithVerifiedWallets(walletIds: readonly string[]) {
  return {
    schemaVersion: 1,
    profileId: "profile-1",
    identity: { state: "live", data: null, lastUpdatedAt: null, message: null },
    wallets: {
      state: "live",
      data: {
        verifiedWalletCount: walletIds.length,
        verifiedWallets: walletIds.map((walletId) => ({
          walletId,
          chainNamespace: "eip155" as const,
          address: `0x${walletId}`,
          normalizedAddress: `0x${walletId}`.toLowerCase(),
        })),
        latestSuccessfulSync: null,
        chainDistribution: {},
      },
      lastUpdatedAt: null,
      message: null,
    },
    inventory: { state: "live", data: null, lastUpdatedAt: null, message: null },
    collectionSummaries: {
      state: "live",
      data: [],
      lastUpdatedAt: null,
      message: null,
    },
    statusModules: {
      collectorScore: {
        state: "coming_soon",
        data: null,
        lastUpdatedAt: null,
        message: "Coming Soon",
      },
      collectionScores: {
        state: "coming_soon",
        data: null,
        lastUpdatedAt: null,
        message: "Coming Soon",
      },
      communities: {
        state: "coming_soon",
        data: null,
        lastUpdatedAt: null,
        message: "Coming Soon",
      },
      followers: {
        state: "coming_soon",
        data: null,
        lastUpdatedAt: null,
        message: "Coming Soon",
      },
      following: {
        state: "coming_soon",
        data: null,
        lastUpdatedAt: null,
        message: "Coming Soon",
      },
    },
    achievements: {
      state: "coming_soon",
      data: null,
      lastUpdatedAt: null,
      message: "Coming Soon",
    },
  } satisfies CollectorIdentityResponse;
}

test("profile owner with verified wallets can see Sync Collectibles action", () => {
  const identity = identityWithVerifiedWallets(["wallet-1"]);
  const verifiedWalletIds = getVerifiedWalletIdsForSync(identity);
  assert.equal(
    canShowSyncCollectiblesAction({
      isOwner: true,
      verifiedWalletIds,
      registryUnavailable: false,
      verificationSessionActive: false,
    }),
    true
  );
});

test("non-owner does not see Sync Collectibles action", () => {
  const identity = identityWithVerifiedWallets(["wallet-1"]);
  const verifiedWalletIds = getVerifiedWalletIdsForSync(identity);
  assert.equal(
    canShowSyncCollectiblesAction({
      isOwner: false,
      verifiedWalletIds,
      registryUnavailable: false,
      verificationSessionActive: false,
    }),
    false
  );
});

test("manual sync invokes existing inventory sync endpoint client sequentially", async () => {
  const calls: string[] = [];
  const result = await syncVerifiedWalletInventories({
    accessToken: "token",
    walletIds: ["wallet-a", "wallet-b"],
    syncInventory: async ({ accessToken, walletId }) => {
      assert.equal(accessToken, "token");
      calls.push(walletId);
      return {
        wallet: {
          walletId,
          chainNamespace: "eip155",
          address: "0xabc",
          normalizedAddress: "0xabc",
          role: "connected",
          verificationStatus: "verified",
          verifiedAt: null,
          disconnectedAt: null,
        },
        inventorySync: {
          status: "success",
          syncId: "sync-id",
          errorMessage: null,
          writtenCount: 1,
          removedCount: 0,
          previousInventoryPreserved: false,
        },
      };
    },
  });

  assert.deepEqual(calls, ["wallet-a", "wallet-b"]);
  assert.equal(result.attempted, 2);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failures.length, 0);
});

test("duplicate submissions are disabled while syncing", () => {
  assert.equal(isSyncCollectiblesButtonDisabled(true), true);
  assert.equal(getSyncCollectiblesButtonLabel(true), "Syncing...");
});

test("successful sync feedback triggers identity refresh", () => {
  const feedback = buildManualInventorySyncFeedback({
    attempted: 1,
    succeeded: 1,
    failures: [],
  });
  assert.equal(feedback.shouldRefreshIdentity, true);
  assert.equal(feedback.status?.kind, "success");
  assert.equal(feedback.status?.message, "Inventory updated.");
  assert.deepEqual(feedback.status?.details, {
    attempted: 1,
    succeeded: 1,
    failed: 0,
  });
});

test("failed sync feedback preserves displayed snapshot and reports error", () => {
  const feedback = buildManualInventorySyncFeedback({
    attempted: 1,
    succeeded: 0,
    failures: [{ walletId: "wallet-1", message: "provider unavailable" }],
  });
  assert.equal(feedback.shouldRefreshIdentity, false);
  assert.equal(feedback.status?.kind, "error");
  assert.equal(feedback.status?.message, "provider unavailable");
  assert.deepEqual(feedback.status?.details, {
    attempted: 1,
    succeeded: 0,
    failed: 1,
  });
});

test("profile sync action does not invoke wallet verification endpoints", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/profile/profile-header.tsx"),
    "utf8"
  );
  assert.match(source, /syncVerifiedWalletInventories/);
  assert.equal(source.includes("verifyWalletOwnership"), false);
  assert.equal(source.includes("createWalletVerificationChallenge"), false);
  assert.equal(source.includes("registerWallet"), false);
});

test("loading and error state markers are rendered in profile header source", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/profile/profile-header.tsx"),
    "utf8"
  );
  assert.match(source, /label="Latest Sync"/);
  assert.match(source, /footer=\{/);
  assert.match(source, /data-testid="sync-collectibles-action"/);
  assert.match(source, /sync-collectibles-error/);
  assert.match(source, /sync-collectibles-success/);
  assert.match(source, /getSyncCollectiblesButtonLabel\(syncingInventory\)/);
});
