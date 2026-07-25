import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  aggregateCollections,
  buildChainDistribution,
  buildCollectorSummary,
  buildDuplicateAssets,
  resolveLastInventorySync,
  selectVerifiedConnectedWallets,
} from "@/lib/collector-analysis/aggregation";
import {
  assetIdentityKey,
  sumQuantityStrings,
  type CollectorInventoryAnalysis,
  type CollectorInventorySummary,
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
  assert.equal(typeof analysis.summary.totalNFTs, "number");
  assert.equal(typeof analysis.summary.totalAssets, "number");
}

test("repository contract exposes read methods required for analysis", () => {
  const repository: WalletInventoryRepository =
    createInMemoryWalletInventoryRepository();
  assert.equal(typeof repository.listHoldingsByWallet, "function");
  assert.equal(typeof repository.listHoldingsByWallets, "function");
  assert.equal(typeof repository.listHoldingsByCollection, "function");
  assert.equal(typeof repository.findLatestSync, "function");
  // PR6 must remain read-only at the analysis boundary — write methods stay
  // on the inventory repository for PR5 sync only.
  assert.equal(typeof repository.replaceWalletInventory, "function");
});

test("repository retrieves holdings by wallet, wallets, and collection", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput("wallet-a", {
      contractAddress: "0xaaa",
      tokenId: "1",
      ownerAddress: "0xa",
    }),
    holdingInput("wallet-a", {
      contractAddress: "0xbbb",
      tokenId: "2",
      ownerAddress: "0xa",
    }),
    holdingInput("wallet-b", {
      contractAddress: "0xaaa",
      tokenId: "3",
      ownerAddress: "0xb",
    }),
  ]);

  const byWallet = await inventory.listHoldingsByWallet("wallet-a");
  assert.equal(byWallet.length, 2);

  const byWallets = await inventory.listHoldingsByWallets([
    "wallet-a",
    "wallet-b",
  ]);
  assert.equal(byWallets.length, 3);

  const collectionId = stableCollectionId("eip155", "0xaaa");
  const byCollection = await inventory.listHoldingsByCollection(collectionId);
  assert.equal(byCollection.length, 2);
  assert.ok(byCollection.every((row) => row.collectionId === collectionId));
});

test("single wallet analysis summarizes inventory and collections", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0xcol1",
      tokenId: "1",
      ownerAddress: wallet.normalizedAddress,
    }),
    holdingInput(wallet.id, {
      contractAddress: "0xcol1",
      tokenId: "2",
      ownerAddress: wallet.normalizedAddress,
    }),
    holdingInput(wallet.id, {
      contractAddress: "0xcol2",
      tokenId: "9",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);
  await inventory.startSync({
    walletId: wallet.id,
    provider: "test",
    syncStartedAt: "2026-07-25T10:00:00.000Z",
  });
  const started = await inventory.findLatestSync(wallet.id);
  assert.ok(started);
  await inventory.completeSync({
    syncId: started.id,
    syncStatus: "success",
    syncCompletedAt: "2026-07-25T10:00:05.000Z",
  });

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: wallet.profileId,
  });

  assert.equal(analysis.verifiedWallets.length, 1);
  assert.equal(analysis.summary.verifiedWalletCount, 1);
  assert.equal(analysis.summary.totalCollections, 2);
  assert.equal(analysis.summary.totalNFTs, 3);
  assert.equal(analysis.summary.totalAssets, 3);
  assert.equal(analysis.summary.lastInventorySync, "2026-07-25T10:00:05.000Z");
  assert.equal(analysis.collections.length, 2);

  const col1 = analysis.collections.find(
    (entry) => entry.collectionId === stableCollectionId("eip155", "0xcol1")
  );
  assert.ok(col1);
  assert.equal(col1.totalAssetsOwned, 2);
  assert.equal(col1.uniqueTokenCount, 2);
  assert.equal(col1.totalQuantity, "2");
  assert.deepEqual(col1.walletsContainingCollection, [wallet.id]);
  assertDomainOnlyAnalysis(analysis);
});

test("multiple verified wallets aggregate without double-counting unique NFTs", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: walletA } = await createVerifiedWallet(profileWallets, {
    address: "0x1111111111111111111111111111111111111111",
  });
  const { wallet: walletB } = await createVerifiedWallet(profileWallets, {
    address: "0x2222222222222222222222222222222222222222",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  // Distinct tokens across wallets.
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
  ]);

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.verifiedWalletCount, 2);
  assert.equal(analysis.summary.totalNFTs, 2);
  assert.equal(analysis.summary.totalAssets, 2);
  assert.equal(analysis.summary.totalCollections, 1);

  const collection = analysis.collections[0];
  assert.equal(collection.uniqueTokenCount, 2);
  assert.equal(collection.totalAssetsOwned, 2);
  assert.deepEqual(
    [...collection.walletsContainingCollection].sort(),
    [walletA.id, walletB.id].sort()
  );
  // Provenance preserved on holdings.
  assert.equal(analysis.holdings.length, 2);
  assert.ok(analysis.holdings.some((row) => row.walletId === walletA.id));
  assert.ok(analysis.holdings.some((row) => row.walletId === walletB.id));
});

test("duplicate NFT across wallets is counted once for totalNFTs and listed", async () => {
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

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.totalNFTs, 1);
  assert.equal(analysis.summary.totalAssets, 2);
  assert.equal(analysis.summary.duplicateAssets.length, 1);
  assert.deepEqual(
    [...analysis.summary.duplicateAssets[0].walletIds].sort(),
    [walletA.id, walletB.id].sort()
  );

  const collection = analysis.collections[0];
  assert.equal(collection.uniqueTokenCount, 1);
  assert.equal(collection.totalAssetsOwned, 2);
  assert.equal(collection.totalQuantity, "2");
});

test("ERC1155 quantities aggregate into totalQuantity and totalAssets", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(wallet.id, {
      contractAddress: "0x1155",
      tokenId: "7",
      assetStandard: "erc1155",
      quantity: "5",
      ownerAddress: wallet.normalizedAddress,
    }),
    holdingInput(wallet.id, {
      contractAddress: "0x1155",
      tokenId: "8",
      assetStandard: "erc1155",
      quantity: "3",
      ownerAddress: wallet.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: wallet.profileId,
  });

  assert.equal(analysis.summary.totalNFTs, 2);
  assert.equal(analysis.summary.totalAssets, 8);
  assert.equal(analysis.collections[0].totalQuantity, "8");
  assert.equal(analysis.collections[0].uniqueTokenCount, 2);
  assert.equal(analysis.collections[0].totalAssetsOwned, 2);
});

test("collection aggregation uses normalized collection identity only", () => {
  const holdings: NormalizedHolding[] = [
    {
      id: "1",
      walletId: "w1",
      chainNamespace: "eip155",
      contractAddress: "0xabc",
      tokenId: "1",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: "eip155:0xabc",
      ownerAddress: "0x1",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "test",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      id: "2",
      walletId: "w2",
      chainNamespace: "eip155",
      contractAddress: "0xabc",
      tokenId: "2",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: "eip155:0xabc",
      ownerAddress: "0x2",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "test",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  ];

  const collections = aggregateCollections(holdings);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].collectionId, "eip155:0xabc");
  assert.equal(collections[0].chainNamespace, "eip155");
  assert.equal(collections[0].contractAddress, "0xabc");
  assert.equal(collections[0].walletsContainingCollection.length, 2);
});

test("chain distribution covers EVM and Solana uniquely", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: evmWallet } = await createVerifiedWallet(profileWallets, {
    chainNamespace: "eip155",
    address: "0xcccccccccccccccccccccccccccccccccccccccc",
  });
  const { wallet: solWallet } = await createVerifiedWallet(profileWallets, {
    chainNamespace: "solana",
    address: "SoLanaWallet111111111111111111111111111",
  });

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(evmWallet.id, {
      chainNamespace: "eip155",
      contractAddress: "0xevm",
      tokenId: "1",
      ownerAddress: evmWallet.normalizedAddress,
    }),
    holdingInput(evmWallet.id, {
      chainNamespace: "eip155",
      contractAddress: "0xevm",
      tokenId: "2",
      ownerAddress: evmWallet.normalizedAddress,
    }),
    holdingInput(solWallet.id, {
      chainNamespace: "solana",
      contractAddress: "MintAAA",
      tokenId: "MintAAA",
      assetStandard: "solana_nft",
      ownerAddress: solWallet.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.summary.chainDistribution.eip155, 2);
  assert.equal(analysis.summary.chainDistribution.solana, 1);
  assert.equal(analysis.summary.totalCollections, 2);
  assert.equal(analysis.summary.totalNFTs, 3);
});

test("empty collector returns zeroed summary", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const inventory = createInMemoryWalletInventoryRepository();
  // Profile with only a pending wallet — not eligible for analysis.
  await profileWallets.createWallet({
    profileId: "profile-empty",
    chainNamespace: "eip155",
    address: "0xdddddddddddddddddddddddddddddddddddddddd",
    role: "connected",
  });

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-empty",
  });

  assert.equal(analysis.verifiedWallets.length, 0);
  assert.deepEqual(analysis.summary, {
    verifiedWalletCount: 0,
    totalCollections: 0,
    totalNFTs: 0,
    totalAssets: 0,
    chainDistribution: Object.freeze({}),
    collectionDistribution: Object.freeze([]),
    duplicateAssets: Object.freeze([]),
    lastInventorySync: null,
  } satisfies CollectorInventorySummary);
  assert.equal(analysis.collections.length, 0);
  assert.equal(analysis.holdings.length, 0);
});

test("mixed EVM/Solana collector excludes disconnected and revoked wallets", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const { wallet: evm } = await createVerifiedWallet(profileWallets, {
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  });
  const { wallet: sol } = await createVerifiedWallet(profileWallets, {
    chainNamespace: "solana",
    address: "SoLMixedWallet2222222222222222222222222",
  });
  const pending = await profileWallets.createWallet({
    profileId: "profile-analysis",
    chainNamespace: "eip155",
    address: "0xffffffffffffffffffffffffffffffffffffffff",
    role: "connected",
  });
  const revokedBase = await profileWallets.createWallet({
    profileId: "profile-analysis",
    chainNamespace: "eip155",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    role: "connected",
  });
  const revoked = await profileWallets.markWalletVerified(revokedBase.id);
  await profileWallets.updateWalletVerificationStatus(revoked.id, "revoked");
  await profileWallets.markWalletDisconnected(sol.id);

  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.upsertHoldings([
    holdingInput(evm.id, {
      contractAddress: "0xkeep",
      tokenId: "1",
      ownerAddress: evm.normalizedAddress,
    }),
    holdingInput(sol.id, {
      chainNamespace: "solana",
      contractAddress: "MintDisconnected",
      tokenId: "MintDisconnected",
      assetStandard: "solana_nft",
      ownerAddress: sol.normalizedAddress,
    }),
    holdingInput(pending.id, {
      contractAddress: "0xpending",
      tokenId: "1",
      ownerAddress: pending.normalizedAddress,
    }),
    holdingInput(revoked.id, {
      contractAddress: "0xrevoked",
      tokenId: "1",
      ownerAddress: revoked.normalizedAddress,
    }),
  ]);

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const analysis = await service.analyzeCollectorInventory({
    profileId: "profile-analysis",
  });

  assert.equal(analysis.verifiedWallets.length, 1);
  assert.equal(analysis.verifiedWallets[0].walletId, evm.id);
  assert.equal(analysis.holdings.length, 1);
  assert.equal(analysis.holdings[0].contractAddress, "0xkeep");
  assert.equal(analysis.summary.chainDistribution.eip155, 1);
  assert.equal(analysis.summary.chainDistribution.solana, undefined);
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

  const service = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
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
  assert.equal(
    "syncVerifiedWalletInventory" in service,
    false
  );
  assert.equal("upsertHoldings" in service, false);
  assert.equal("replaceWalletInventory" in service, false);
});

test("quantity helpers and asset identity utilities", () => {
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
      "not-a-date",
    ]),
    "2026-07-25T12:00:00.000Z"
  );

  const wallets = selectVerifiedConnectedWallets([
    {
      id: "v",
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
      id: "pending",
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
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].id, "v");

  const sampleHoldings: NormalizedHolding[] = [
    {
      id: "1",
      walletId: "a",
      chainNamespace: "eip155",
      contractAddress: "0x1",
      tokenId: "1",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: "eip155:0x1",
      ownerAddress: "0xa",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "t",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      id: "2",
      walletId: "b",
      chainNamespace: "eip155",
      contractAddress: "0x1",
      tokenId: "1",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: "eip155:0x1",
      ownerAddress: "0xb",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "t",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      id: "3",
      walletId: "a",
      chainNamespace: "solana",
      contractAddress: "MintX",
      tokenId: "MintX",
      assetStandard: "solana_nft",
      quantity: "1",
      collectionId: "solana:MintX",
      ownerAddress: "SoL",
      acquiredAt: null,
      lastSeenAt: "2026-07-25T00:00:00.000Z",
      sourceProvider: "t",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  ];

  assert.equal(buildDuplicateAssets(sampleHoldings).length, 1);
  assert.deepEqual(buildChainDistribution(sampleHoldings), {
    eip155: 1,
    solana: 1,
  });

  const summary = buildCollectorSummary({
    verifiedWallets: wallets,
    holdings: [],
    collections: [],
    lastInventorySync: null,
  });
  assert.equal(summary.totalNFTs, 0);
  assert.equal(summary.verifiedWalletCount, 1);
});
