import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createCollectorAnalysisService } from "@/lib/collector-analysis/service";
import {
  InventoryUnavailableError,
  NoVerifiedWalletsError,
  CollectorProfileNotFoundError,
  type CollectorProfile,
} from "@/lib/collector-profile/domain";
import {
  createCollectorProfileService,
  type CollectorProfileService,
} from "@/lib/collector-profile/service";
import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import { stableCollectionId } from "@/lib/wallet-inventory/domain";
import {
  createInMemoryWalletInventoryRepository,
  type UpsertHoldingInput,
  type WalletInventoryRepository,
} from "@/lib/wallet-inventory/repository";

async function createVerifiedWallet(
  profileWallets = createInMemoryProfileWalletRepository(),
  input: {
    profileId?: string;
    chainNamespace?: "eip155" | "solana";
    address?: string;
  } = {}
) {
  const created = await profileWallets.createWallet({
    profileId: input.profileId ?? "profile-collector",
    chainNamespace: input.chainNamespace ?? "eip155",
    address: input.address ?? "0xAbCdEf1234567890abcdef1234567890abcdef12",
    role: "connected",
  });
  const verified = await profileWallets.markWalletVerified(created.id);
  return { profileWallets, wallet: verified };
}

function holdingInput(
  walletId: string,
  overrides: Partial<UpsertHoldingInput> &
    Pick<UpsertHoldingInput, "contractAddress" | "tokenId">
): UpsertHoldingInput {
  const chainNamespace = overrides.chainNamespace ?? "eip155";
  const contractAddress = overrides.contractAddress;
  return {
    walletId,
    chainNamespace,
    contractAddress,
    tokenId: overrides.tokenId,
    assetStandard: overrides.assetStandard ?? "erc721",
    quantity: overrides.quantity ?? "1",
    collectionId:
      overrides.collectionId === undefined
        ? stableCollectionId(chainNamespace, contractAddress)
        : overrides.collectionId,
    ownerAddress: overrides.ownerAddress ?? "0xowner",
    acquiredAt: overrides.acquiredAt ?? null,
    lastSeenAt: overrides.lastSeenAt ?? "2026-07-25T12:00:00.000Z",
    sourceProvider: overrides.sourceProvider ?? "test-inventory",
  };
}

function createProfileStack(input?: {
  profileWallets?: ReturnType<typeof createInMemoryProfileWalletRepository>;
  inventory?: WalletInventoryRepository;
}) {
  const profileWallets =
    input?.profileWallets ?? createInMemoryProfileWalletRepository();
  const inventory =
    input?.inventory ?? createInMemoryWalletInventoryRepository();
  const analysis = createCollectorAnalysisService({ profileWallets, inventory });
  const service = createCollectorProfileService({
    profileWallets,
    inventory,
    analysis,
  });
  return { profileWallets, inventory, analysis, service };
}

function assertDomainOnlyProfile(profile: CollectorProfile) {
  const forbidden = [
    "alchemy",
    "helius",
    "rawResponse",
    "providerPayload",
    "rpcResponse",
    "collectionScore",
    "collectorScore",
    "floorPrice",
    "rarity",
  ];
  const serialized = JSON.stringify(profile).toLowerCase();
  for (const key of forbidden) {
    assert.equal(
      serialized.includes(key.toLowerCase()),
      false,
      `profile must not expose forbidden key: ${key}`
    );
  }

  assert.equal(typeof profile.identity.profileId, "string");
  assert.equal(profile.identity.displayName, null);
  assert.equal(profile.identity.avatarUrl, null);
  assert.equal(profile.identity.bio, null);
  assert.ok(Array.isArray(profile.walletSummary.verifiedWallets));
  assert.ok(Array.isArray(profile.collectionSummaries));
  assert.equal(typeof profile.inventorySummary.totalQuantity, "string");
  assert.equal("pricing" in profile.inventorySummary, false);
  assert.equal("scores" in profile, false);
}

test("repository contract exposes batched successful-sync read for profile composition", () => {
  const repository: WalletInventoryRepository =
    createInMemoryWalletInventoryRepository();
  assert.equal(typeof repository.listHoldingsByWallets, "function");
  assert.equal(typeof repository.findLatestSuccessfulSync, "function");
  assert.equal(typeof repository.findLatestSuccessfulSyncs, "function");
});

test("batched findLatestSuccessfulSyncs returns one entry per wallet without N+1 shape", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  const syncA = await inventory.startSync({
    walletId: "wallet-a",
    provider: "test",
    syncStartedAt: "2026-07-25T10:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: syncA.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T10:00:05.000Z",
  });
  const syncB = await inventory.startSync({
    walletId: "wallet-b",
    provider: "test",
    syncStartedAt: "2026-07-25T11:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: syncB.id,
    syncStatus: "failure",
    syncCompletedAt: "2026-07-25T11:00:01.000Z",
    errorMessage: "timeout",
  });

  const batched = await inventory.findLatestSuccessfulSyncs([
    "wallet-a",
    "wallet-b",
    "wallet-c",
  ]);

  assert.equal(batched.size, 3);
  assert.equal(batched.get("wallet-a")?.syncStatus, "success");
  assert.equal(batched.get("wallet-b"), null);
  assert.equal(batched.get("wallet-c"), null);
});

test("collector with one wallet composes a profile", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const { inventory, service } = createProfileStack({ profileWallets });
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0xcol1",
      tokenId: "1",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);
  const started = await inventory.startSync({
    walletId: wallet.id,
    provider: "test",
    syncStartedAt: "2026-07-25T09:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: started.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T09:00:10.000Z",
  });

  const profile = await service.getCollectorProfile({
    profileId: wallet.profileId,
  });

  assert.equal(profile.identity.profileId, wallet.profileId);
  assert.equal(profile.walletSummary.walletCount, 1);
  assert.equal(profile.walletSummary.verifiedWallets[0].walletId, wallet.id);
  assert.equal(profile.walletSummary.latestSuccessfulSync, "2026-07-25T09:00:10.000Z");
  assert.equal(profile.inventorySummary.uniqueTokenCount, 1);
  assert.equal(profile.inventorySummary.totalCollections, 1);
  assert.equal(profile.inventorySummary.totalQuantity, "1");
  assert.equal(profile.collectionSummaries.length, 1);
  assert.equal(
    profile.collectionSummaries[0].collectionId,
    stableCollectionId("eip155", "0xcol1")
  );
  assertDomainOnlyProfile(profile);
});

test("collector with multiple wallets aggregates across wallets", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });
  const { inventory, service } = createProfileStack({ profileWallets });

  await inventory.upsertHoldings([
    holdingInput(walletA.id, {
      contractAddress: "0xshared",
      tokenId: "1",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0xshared",
      tokenId: "2",
      ownerAddress: walletB.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0xother",
      tokenId: "9",
      ownerAddress: walletB.normalizedAddress,
    }),
  ]);

  const profile = await service.getCollectorProfile({
    profileId: "profile-collector",
  });

  assert.equal(profile.walletSummary.walletCount, 2);
  assert.equal(profile.inventorySummary.uniqueTokenCount, 3);
  assert.equal(profile.inventorySummary.totalCollections, 2);
  assert.equal(profile.inventorySummary.totalQuantity, "3");

  const shared = profile.collectionSummaries.find(
    (entry) => entry.collectionId === stableCollectionId("eip155", "0xshared")
  );
  assert.ok(shared);
  assert.equal(shared.uniqueTokenCount, 2);
  assert.deepEqual(shared.walletsContainingCollection, [walletA.id, walletB.id].sort());
});

test("collector with no verified wallets returns explicit domain error", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  await profileWallets.createWallet({
    profileId: "profile-pending",
    chainNamespace: "eip155",
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    role: "connected",
  });
  const { service } = createProfileStack({ profileWallets });

  await assert.rejects(
    () => service.getCollectorProfile({ profileId: "profile-pending" }),
    (error: unknown) =>
      error instanceof NoVerifiedWalletsError &&
      error.code === "no_verified_wallets"
  );
});

test("unknown profile returns profile_not_found", async () => {
  const { service } = createProfileStack();
  await assert.rejects(
    () => service.getCollectorProfile({ profileId: "missing-profile" }),
    (error: unknown) =>
      error instanceof CollectorProfileNotFoundError &&
      error.code === "profile_not_found"
  );
});

test("collector with empty inventory returns zeroed inventory summary", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    profileId: "profile-empty-inv",
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  const { service } = createProfileStack({ profileWallets });

  const profile = await service.getCollectorProfile({
    profileId: wallet.profileId,
  });

  assert.equal(profile.walletSummary.walletCount, 1);
  assert.equal(profile.inventorySummary.totalCollections, 0);
  assert.equal(profile.inventorySummary.uniqueTokenCount, 0);
  assert.equal(profile.inventorySummary.totalQuantity, "0");
  assert.deepEqual(profile.inventorySummary.duplicateAssets, []);
  assert.deepEqual(profile.collectionSummaries, []);
  assert.equal(profile.walletSummary.latestSuccessfulSync, null);
  assertDomainOnlyProfile(profile);
});

test("mixed EVM and Solana collector composes both namespaces", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: evm } = await createVerifiedWallet(profileWallets, {
    profileId: "profile-multi",
    chainNamespace: "eip155",
    address: "0xcccccccccccccccccccccccccccccccccccccccc",
  });
  const { wallet: sol } = await createVerifiedWallet(profileWallets, {
    profileId: "profile-multi",
    chainNamespace: "solana",
    address: "7EqQdEULxWcraRxgijc62c5Fv9RVyaKEe8Jm5Jh3Y9yK",
  });
  const { inventory, service } = createProfileStack({ profileWallets });

  await inventory.upsertHoldings([
    holdingInput(evm.id, {
      chainNamespace: "eip155",
      contractAddress: "0xevmcol",
      tokenId: "1",
      ownerAddress: evm.normalizedAddress,
    }),
    holdingInput(sol.id, {
      chainNamespace: "solana",
      contractAddress: "SoLCollection111111111111111111111111111111",
      tokenId: "mint111111111111111111111111111111111111111",
      assetStandard: "solana_nft",
      collectionId: stableCollectionId(
        "solana",
        "SoLCollection111111111111111111111111111111"
      ),
      ownerAddress: sol.normalizedAddress,
    }),
  ]);

  const profile = await service.getCollectorProfile({
    profileId: "profile-multi",
  });

  assert.equal(profile.walletSummary.walletCount, 2);
  assert.equal(profile.walletSummary.chainDistribution.eip155, 1);
  assert.equal(profile.walletSummary.chainDistribution.solana, 1);
  assert.equal(profile.inventorySummary.uniqueTokenCount, 2);
  assert.equal(profile.collectionSummaries.length, 2);
  assert.ok(
    profile.collectionSummaries.some((entry) => entry.chainNamespace === "eip155")
  );
  assert.ok(
    profile.collectionSummaries.some((entry) => entry.chainNamespace === "solana")
  );
});

test("duplicate assets across wallets appear in inventory summary", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });
  const { inventory, service } = createProfileStack({ profileWallets });

  await inventory.upsertHoldings([
    holdingInput(walletA.id, {
      contractAddress: "0xdupe",
      tokenId: "7",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0xdupe",
      tokenId: "7",
      ownerAddress: walletB.normalizedAddress,
    }),
  ]);

  const profile = await service.getCollectorProfile({
    profileId: "profile-collector",
  });

  assert.equal(profile.inventorySummary.uniqueTokenCount, 1);
  assert.equal(profile.inventorySummary.totalQuantity, "2");
  assert.equal(profile.inventorySummary.duplicateAssets.length, 1);
  assert.deepEqual(
    [...profile.inventorySummary.duplicateAssets[0].walletIds].sort(),
    [walletA.id, walletB.id].sort()
  );
});

test("collection summaries expose required fields only", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const { inventory, service } = createProfileStack({ profileWallets });
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0xsummary",
      tokenId: "1",
      quantity: "3",
      assetStandard: "erc1155",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);

  const profile = await service.getCollectorProfile({
    profileId: wallet.profileId,
  });

  assert.equal(profile.collectionSummaries.length, 1);
  const summary = profile.collectionSummaries[0];
  assert.equal(
    summary.collectionId,
    stableCollectionId("eip155", "0xsummary")
  );
  assert.equal(summary.chainNamespace, "eip155");
  assert.equal(summary.contractAddress, "0xsummary");
  assert.equal(summary.uniqueTokenCount, 1);
  assert.equal(summary.totalQuantity, "3");
  assert.deepEqual(summary.walletsContainingCollection, [wallet.id]);
  assert.equal("ownershipRecordCount" in summary, false);
  assert.equal("floorPrice" in summary, false);
  assert.equal("rarity" in summary, false);
});

test("inventory unavailable surfaces explicit domain error", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  const failingInventory: WalletInventoryRepository = {
    ...inventory,
    async findLatestSuccessfulSyncs() {
      throw new Error("db unavailable");
    },
  };
  const analysis = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const service = createCollectorProfileService({
    profileWallets,
    inventory: failingInventory,
    analysis,
  });

  await assert.rejects(
    () => service.getCollectorProfile({ profileId: wallet.profileId }),
    (error: unknown) =>
      error instanceof InventoryUnavailableError &&
      error.code === "inventory_unavailable"
  );
});

test("provider independence: profile module source has no provider imports", () => {
  const root = path.resolve("src/lib/collector-profile");
  const files = readdirSync(root).filter((file) => file.endsWith(".ts"));
  const forbiddenImport =
    /from\s+["'][^"']*(alchemy|helius|wallet-inventory\/providers|wallet-inventory\/adapters|providers\/)[^"']*["']/i;

  for (const file of files) {
    if (file.endsWith(".test.ts")) continue;
    const source = readFileSync(path.join(root, file), "utf8");
    assert.equal(
      forbiddenImport.test(source),
      false,
      `${file} must not import provider modules`
    );
    assert.equal(
      /WalletInventoryProvider|createEvmInventoryProvider|createSolanaInventoryProvider/.test(
        source
      ),
      false,
      `${file} must not reference inventory provider types`
    );
  }
});

test("CollectorProfileService is read-only (no sync/write/score surface)", () => {
  const { service } = createProfileStack();
  const typed: CollectorProfileService = service;
  assert.equal(typeof typed.getCollectorProfile, "function");
  assert.equal("syncVerifiedWalletInventory" in service, false);
  assert.equal("upsertHoldings" in service, false);
  assert.equal("replaceWalletInventory" in service, false);
  assert.equal("calculateCollectorScore" in service, false);
  assert.equal("calculateCollectionScore" in service, false);
});

test("profile composition does not mutate inventory", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const { inventory, service } = createProfileStack({ profileWallets });
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0ximmutable",
      tokenId: "1",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);
  const before = await inventory.listHoldingsByWallet(wallet.id);

  await service.getCollectorProfile({ profileId: wallet.profileId });

  const after = await inventory.listHoldingsByWallet(wallet.id);
  assert.deepEqual(after, before);
});

test("deterministic profile output for the same domain state", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(walletB.id, {
      contractAddress: "0xz",
      tokenId: "2",
      ownerAddress: walletB.normalizedAddress,
    }),
    holdingInput(walletA.id, {
      contractAddress: "0xa",
      tokenId: "1",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletA.id, {
      contractAddress: "0xz",
      tokenId: "2",
      ownerAddress: walletA.normalizedAddress,
    }),
  ]);

  const firstStack = createProfileStack({ profileWallets, inventory });
  const secondStack = createProfileStack({ profileWallets, inventory });
  const first = await firstStack.service.getCollectorProfile({
    profileId: "profile-collector",
  });
  const second = await secondStack.service.getCollectorProfile({
    profileId: "profile-collector",
  });

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.walletSummary.verifiedWallets.map((wallet) => wallet.walletId),
    [...first.walletSummary.verifiedWallets.map((wallet) => wallet.walletId)].sort()
  );
  assert.deepEqual(
    first.collectionSummaries.map((entry) => entry.collectionId),
    [...first.collectionSummaries.map((entry) => entry.collectionId)].sort()
  );
});

test("docs describe PR7 read-only composition boundaries", () => {
  const docs = readFileSync("docs/collector-profile-read-model.md", "utf8");
  assert.match(docs, /CollectorProfileService`? is read-only/i);
  assert.match(docs, /No blockchain calls occur in PR7/i);
  assert.match(docs, /No scoring or marketplace enrichment occurs in PR7/i);
  assert.match(docs, /Future UI should consume this read model/i);
  assert.match(docs, /CollectorAnalysisService/);
});
