import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  aggregateCollections,
  buildChainDistribution,
  buildCollectorSummary,
  buildDuplicateAssets,
  resolveGroupingCollectionId,
  resolveLastInventorySync,
  selectVerifiedConnectedWallets,
  sortHoldingsDeterministically,
} from "@/lib/collector-analysis/aggregation";
import {
  assetIdentityKey,
  assetSpecificCollectionId,
  sumQuantityStrings,
  type CollectorInventoryAnalysis,
} from "@/lib/collector-analysis/domain";
import {
  createCollectorAnalysisService,
  type CollectorAnalysisService,
} from "@/lib/collector-analysis/service";
import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import type { NormalizedHolding } from "@/lib/wallet-inventory/domain";
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
    profileId: input.profileId ?? "profile-analysis",
    chainNamespace: input.chainNamespace ?? "eip155",
    address: input.address ?? "0xAbCdEf1234567890",
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

function assertDomainOnlyAnalysis(analysis: CollectorInventoryAnalysis) {
  const forbidden = [
    "alchemy",
    "helius",
    "rawResponse",
    "providerPayload",
    "rpcResponse",
  ];
  const serialized = JSON.stringify(analysis).toLowerCase();
  for (const key of forbidden) {
    assert.equal(
      serialized.includes(key),
      false,
      `analysis must not expose provider leak key: ${key}`
    );
  }

  assert.ok(Array.isArray(analysis.collections));
  assert.ok(analysis.summary);
  assert.equal(typeof analysis.summary.verifiedWalletCount, "number");
  assert.equal(typeof analysis.summary.totalCollections, "number");
  assert.equal(typeof analysis.summary.uniqueTokenCount, "number");
  assert.equal(typeof analysis.summary.totalQuantity, "string");
  assert.equal("totalNFTs" in analysis.summary, false);
  assert.equal("totalAssets" in analysis.summary, false);
}

test("repository contract exposes read methods required for analysis", () => {
  const repository: WalletInventoryRepository =
    createInMemoryWalletInventoryRepository();
  assert.equal(typeof repository.listHoldingsByWallet, "function");
  assert.equal(typeof repository.listHoldingsByWallets, "function");
  assert.equal(typeof repository.listHoldingsByCollection, "function");
  assert.equal(typeof repository.findLatestSync, "function");
  assert.equal(typeof repository.findLatestSuccessfulSync, "function");
});

test("verified wallet is included in collector analysis", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0xcol1",
      tokenId: "1",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: wallet.profileId,
  });

  assert.equal(analysis.verifiedWallets.length, 1);
  assert.equal(analysis.verifiedWallets[0].walletId, wallet.id);
  assert.equal(analysis.summary.verifiedWalletCount, 1);
  assert.equal(analysis.summary.uniqueTokenCount, 1);
  assert.equal(analysis.summary.totalQuantity, "1");
  assert.equal(analysis.summary.totalCollections, 1);
  assertDomainOnlyAnalysis(analysis);
});

test("revoked wallet excluded after prior synchronization", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: kept } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: laterRevoked } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(kept.id, {
      contractAddress: "0xkeep",
      tokenId: "1",
      ownerAddress: kept.normalizedAddress,
    }),
    holdingInput(laterRevoked.id, {
      contractAddress: "0xrevoke",
      tokenId: "9",
      ownerAddress: laterRevoked.normalizedAddress,
    }),
  ]);
  const started = await inventory.startSync({
    walletId: laterRevoked.id,
    provider: "test",
  });
  await inventory.completeSync({
    syncId: started.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T10:00:00.000Z",
  });

  await profileWallets.updateWalletVerificationStatus(
    laterRevoked.id,
    "revoked"
  );

  // Holdings still exist in the DB for the revoked wallet.
  assert.equal(
    (await inventory.listHoldingsByWallet(laterRevoked.id)).length,
    1
  );

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.deepEqual(
    analysis.verifiedWallets.map((wallet) => wallet.walletId),
    [kept.id]
  );
  assert.equal(analysis.holdings.length, 1);
  assert.equal(analysis.holdings[0].contractAddress, "0xkeep");
  assert.equal(analysis.summary.uniqueTokenCount, 1);
  assert.equal(analysis.summary.totalCollections, 1);
});

test("disconnected wallet excluded after prior synchronization", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: kept } = await createVerifiedWallet(profileWallets, {
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const { wallet: laterDisconnected } = await createVerifiedWallet(
    profileWallets,
    { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
  );

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(kept.id, {
      contractAddress: "0xkeep",
      tokenId: "1",
      ownerAddress: kept.normalizedAddress,
    }),
    holdingInput(laterDisconnected.id, {
      contractAddress: "0xgone",
      tokenId: "2",
      ownerAddress: laterDisconnected.normalizedAddress,
    }),
  ]);
  await profileWallets.markWalletDisconnected(laterDisconnected.id);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.verifiedWallets.length, 1);
  assert.equal(analysis.verifiedWallets[0].walletId, kept.id);
  assert.equal(analysis.holdings.length, 1);
  assert.equal(analysis.holdings[0].tokenId, "1");
});

test("same ERC721 in two wallets counts one unique token and preserves provenance", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(walletA.id, {
      contractAddress: "0xdup",
      tokenId: "42",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0xdup",
      tokenId: "42",
      ownerAddress: walletB.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.uniqueTokenCount, 1);
  assert.equal(analysis.summary.totalQuantity, "2");
  assert.equal(analysis.collections[0].uniqueTokenCount, 1);
  assert.equal(analysis.collections[0].ownershipRecordCount, 2);
  assert.equal(analysis.summary.duplicateAssets.length, 1);
  assert.deepEqual(
    [...analysis.summary.duplicateAssets[0].walletIds].sort(),
    [walletA.id, walletB.id].sort()
  );
  assert.equal(analysis.holdings.length, 2);
});

test("ERC1155 quantities are summed across wallets for one unique token", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(walletA.id, {
      contractAddress: "0x1155",
      tokenId: "7",
      assetStandard: "erc1155",
      quantity: "5",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0x1155",
      tokenId: "7",
      assetStandard: "erc1155",
      quantity: "3",
      ownerAddress: walletB.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.uniqueTokenCount, 1);
  assert.equal(analysis.summary.totalQuantity, "8");
  assert.equal(analysis.collections[0].totalQuantity, "8");
  assert.equal(analysis.summary.duplicateAssets[0].totalQuantity, "8");
  const expectedWalletQuantities = [
    { walletId: walletA.id, quantity: "5" },
    { walletId: walletB.id, quantity: "3" },
  ].sort((a, b) => a.walletId.localeCompare(b.walletId));
  assert.deepEqual(
    analysis.summary.duplicateAssets[0].walletQuantities,
    expectedWalletQuantities
  );
});

test("identical token IDs on different chains remain distinct", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: evm } = await createVerifiedWallet(profileWallets, {
    address: "0xcccccccccccccccccccccccccccccccccccccccc",
  });
  const { wallet: sol } = await createVerifiedWallet(profileWallets, {
    chainNamespace: "solana",
    address: "SoLChainDistinct11111111111111111111111",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(evm.id, {
      chainNamespace: "eip155",
      contractAddress: "0xsame",
      tokenId: "1",
      ownerAddress: evm.normalizedAddress,
    }),
    holdingInput(sol.id, {
      chainNamespace: "solana",
      contractAddress: "MintSame",
      tokenId: "1",
      assetStandard: "solana_nft",
      collectionId: "solana:VerifiedCollection",
      ownerAddress: sol.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.uniqueTokenCount, 2);
  assert.equal(analysis.summary.chainDistribution.eip155, 1);
  assert.equal(analysis.summary.chainDistribution.solana, 1);
  assert.equal(analysis.summary.duplicateAssets.length, 0);
});

test("Solana holdings with verified collection key group together", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    chainNamespace: "solana",
    address: "SoLCollector111111111111111111111111111",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  const verifiedCollection = "VerifiedCollectionKey111111111111111";
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      chainNamespace: "solana",
      contractAddress: "MintOne111111111111111111111111111111",
      tokenId: "MintOne111111111111111111111111111111",
      assetStandard: "solana_nft",
      collectionId: stableCollectionId("solana", verifiedCollection),
      ownerAddress: wallet.normalizedAddress,
    }),
    holdingInput(wallet.id, {
      chainNamespace: "solana",
      contractAddress: "MintTwo222222222222222222222222222222",
      tokenId: "MintTwo222222222222222222222222222222",
      assetStandard: "solana_nft",
      collectionId: stableCollectionId("solana", verifiedCollection),
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: wallet.profileId,
  });

  assert.equal(analysis.summary.totalCollections, 1);
  assert.equal(analysis.summary.uniqueTokenCount, 2);
  assert.equal(
    analysis.collections[0].collectionId,
    `solana:${verifiedCollection}`
  );
  assert.equal(analysis.collections[0].uniqueTokenCount, 2);
});

test("Solana mint-only identity remains per-mint when no verified collection", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    chainNamespace: "solana",
    address: "SoLNoCollection1111111111111111111111",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      chainNamespace: "solana",
      contractAddress: "MintA",
      tokenId: "MintA",
      assetStandard: "solana_nft",
      collectionId: stableCollectionId("solana", "MintA"),
      ownerAddress: wallet.normalizedAddress,
    }),
    holdingInput(wallet.id, {
      chainNamespace: "solana",
      contractAddress: "MintB",
      tokenId: "MintB",
      assetStandard: "solana_nft",
      collectionId: stableCollectionId("solana", "MintB"),
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: wallet.profileId,
  });

  assert.equal(analysis.summary.totalCollections, 2);
  assert.equal(analysis.summary.uniqueTokenCount, 2);
});

test("unrelated assets with missing collection identity do not collapse", () => {
  const holdings: NormalizedHolding[] = [
    {
      id: "1",
      walletId: "w1",
      chainNamespace: "eip155",
      contractAddress: "0xaaa",
      tokenId: "1",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: null,
      ownerAddress: "0x1",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "test",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      id: "2",
      walletId: "w1",
      chainNamespace: "eip155",
      contractAddress: "0xbbb",
      tokenId: "2",
      assetStandard: "erc721",
      quantity: "4",
      collectionId: null,
      ownerAddress: "0x1",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "test",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  ];

  const collections = aggregateCollections(holdings);
  assert.equal(collections.length, 2);
  assert.ok(
    collections.every((entry) => entry.collectionId.startsWith("asset:"))
  );
  assert.notEqual(collections[0].collectionId, collections[1].collectionId);

  const summary = buildCollectorSummary({
    verifiedWallets: [
      {
        id: "w1",
        profileId: "p",
        chainNamespace: "eip155",
        address: "0x1",
        normalizedAddress: "0x1",
        role: "connected",
        verificationStatus: "verified",
        verifiedAt: "2026-07-25T00:00:00.000Z",
        disconnectedAt: null,
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
    ],
    holdings,
    collections,
    lastInventorySync: null,
    walletFreshness: [{ walletId: "w1", lastSuccessfulSyncAt: null }],
  });
  assert.equal(summary.uniqueTokenCount, 2);
  assert.equal(summary.totalQuantity, "5");
  assert.equal(summary.totalCollections, 2);
  assert.equal(
    resolveGroupingCollectionId(holdings[0]),
    assetSpecificCollectionId(holdings[0])
  );
});

test("deterministic output is independent of input order", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  const rows = [
    holdingInput(walletB.id, {
      contractAddress: "0xzzz",
      tokenId: "2",
      ownerAddress: walletB.normalizedAddress,
    }),
    holdingInput(walletA.id, {
      contractAddress: "0xaaa",
      tokenId: "1",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletA.id, {
      contractAddress: "0xmmm",
      tokenId: "9",
      ownerAddress: walletA.normalizedAddress,
    }),
  ];

  await inventory.upsertHoldings(rows);
  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const first = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  const inventoryReversed = createInMemoryWalletInventoryRepository();
  await inventoryReversed.upsertHoldings([...rows].reverse());
  const second = await createCollectorAnalysisService({
    profileWallets,
    inventory: inventoryReversed,
  }).analyzeCollectorInventory({ profileId: "profile-analysis" });

  assert.deepEqual(
    first.collections.map((entry) => entry.collectionId),
    second.collections.map((entry) => entry.collectionId)
  );
  assert.deepEqual(
    first.holdings.map((row) => assetIdentityKey(row)),
    second.holdings.map((row) => assetIdentityKey(row))
  );
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(
    first.verifiedWallets.map((wallet) => wallet.walletId),
    second.verifiedWallets.map((wallet) => wallet.walletId)
  );

  const normalizedLike = [
    { walletId: "b", chainNamespace: "eip155", contractAddress: "0xz", tokenId: "2" },
    { walletId: "a", chainNamespace: "eip155", contractAddress: "0xa", tokenId: "1" },
  ] as NormalizedHolding[];
  assert.deepEqual(
    sortHoldingsDeterministically(normalizedLike).map((row) => row.walletId),
    sortHoldingsDeterministically([...normalizedLike].reverse()).map(
      (row) => row.walletId
    )
  );
});

test("failed and running syncs are excluded from lastInventorySync", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(walletA.id, {
      contractAddress: "0xa",
      tokenId: "1",
      ownerAddress: walletA.normalizedAddress,
    }),
    holdingInput(walletB.id, {
      contractAddress: "0xb",
      tokenId: "1",
      ownerAddress: walletB.normalizedAddress,
    }),
  ]);

  const success = await inventory.startSync({
    walletId: walletA.id,
    provider: "test",
    syncStartedAt: "2026-07-25T09:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: success.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T09:00:05.000Z",
  });

  // Later failure must not replace the successful timestamp for wallet A.
  const failed = await inventory.startSync({
    walletId: walletA.id,
    provider: "test",
    syncStartedAt: "2026-07-25T12:00:00.000Z",
  });
  await inventory.completeSync({
    syncId: failed.id,
    syncStatus: "failure",
    syncCompletedAt: "2026-07-25T12:00:01.000Z",
    errorMessage: "provider timeout",
  });

  // Wallet B only has a running sync — must not contribute.
  await inventory.startSync({
    walletId: walletB.id,
    provider: "test",
    syncStartedAt: "2026-07-25T13:00:00.000Z",
  });

  const latestAny = await inventory.findLatestSync(walletA.id);
  assert.equal(latestAny?.syncStatus, "failure");
  const latestSuccess = await inventory.findLatestSuccessfulSync(walletA.id);
  assert.equal(latestSuccess?.syncStatus, "success");
  assert.equal(latestSuccess?.syncCompletedAt, "2026-07-25T09:00:05.000Z");

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.lastInventorySync, "2026-07-25T09:00:05.000Z");
  assert.deepEqual(analysis.summary.walletFreshness, [
    { walletId: walletA.id, lastSuccessfulSyncAt: "2026-07-25T09:00:05.000Z" },
    { walletId: walletB.id, lastSuccessfulSyncAt: null },
  ].sort((a, b) => a.walletId.localeCompare(b.walletId)));
});

test("empty collector returns zeroed summary", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const inventory = createInMemoryWalletInventoryRepository();
  await profileWallets.createWallet({
    profileId: "profile-empty",
    chainNamespace: "eip155",
    address: "0xdddddddddddddddddddddddddddddddddddddddd",
    role: "connected",
  });

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-empty",
  });

  assert.equal(analysis.verifiedWallets.length, 0);
  assert.equal(analysis.summary.verifiedWalletCount, 0);
  assert.equal(analysis.summary.totalCollections, 0);
  assert.equal(analysis.summary.uniqueTokenCount, 0);
  assert.equal(analysis.summary.totalQuantity, "0");
  assert.deepEqual(analysis.summary.chainDistribution, {});
  assert.deepEqual(analysis.summary.collectionDistribution, []);
  assert.deepEqual(analysis.summary.duplicateAssets, []);
  assert.equal(analysis.summary.lastInventorySync, null);
  assert.deepEqual(analysis.summary.walletFreshness, []);
  assert.equal(analysis.collections.length, 0);
  assert.equal(analysis.holdings.length, 0);
});

test("analysis service never mutates inventory holdings", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0ximmutable",
      tokenId: "1",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);
  const before = await inventory.listHoldingsByWallet(wallet.id);

  const service = createCollectorAnalysisService({ profileWallets, inventory });
  await service.analyzeCollectorInventory({ profileId: wallet.profileId });

  const after = await inventory.listHoldingsByWallet(wallet.id);
  assert.deepEqual(after, before);
});

test("provider independence: analysis module source has no provider imports", () => {
  const root = path.resolve("src/lib/collector-analysis");
  const files = ["domain.ts", "aggregation.ts", "service.ts"];
  const forbiddenImport =
    /from\s+["'][^"']*(alchemy|helius|wallet-inventory\/providers|wallet-inventory\/adapters)[^"']*["']/i;

  for (const file of files) {
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

test("analysis service interface is read-only (no sync/write surface)", () => {
  const service: CollectorAnalysisService = createCollectorAnalysisService({
    profileWallets: createInMemoryProfileWalletRepository(),
    inventory: createInMemoryWalletInventoryRepository(),
  });
  assert.equal(typeof service.analyzeCollectorInventory, "function");
  assert.equal("syncVerifiedWalletInventory" in service, false);
  assert.equal("upsertHoldings" in service, false);
  assert.equal("replaceWalletInventory" in service, false);
});

test("helpers: quantity sum, asset identity, wallet eligibility", () => {
  assert.equal(sumQuantityStrings(["1", "2", "bad", "3"]), "6");
  assert.equal(
    assetIdentityKey({
      chainNamespace: "eip155",
      contractAddress: "0xabc",
      tokenId: "9",
    }),
    "eip155:0xabc:9"
  );
  assert.equal(
    resolveLastInventorySync([
      "2026-07-25T10:00:00.000Z",
      null,
      "2026-07-25T12:00:00.000Z",
    ]),
    "2026-07-25T12:00:00.000Z"
  );

  const wallets = selectVerifiedConnectedWallets([
    {
      id: "z",
      profileId: "p",
      chainNamespace: "eip155",
      address: "0x1",
      normalizedAddress: "0x1",
      role: "connected",
      verificationStatus: "verified",
      verifiedAt: "2026-07-25T00:00:00.000Z",
      disconnectedAt: null,
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      id: "a",
      profileId: "p",
      chainNamespace: "eip155",
      address: "0x2",
      normalizedAddress: "0x2",
      role: "connected",
      verificationStatus: "pending",
      verifiedAt: null,
      disconnectedAt: null,
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    wallets.map((wallet) => wallet.id),
    ["z"]
  );

  assert.deepEqual(buildChainDistribution([]), {});
  assert.equal(buildDuplicateAssets([]).length, 0);
});
