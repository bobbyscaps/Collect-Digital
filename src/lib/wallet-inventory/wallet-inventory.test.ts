import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  createEvmInventoryProvider,
  normalizeEvmProviderHolding,
  normalizeEvmProviderHoldings,
  type EvmProviderNftHolding,
} from "@/lib/wallet-inventory/adapters/evm";
import {
  createSolanaInventoryProvider,
  normalizeSolanaProviderHolding,
  normalizeSolanaProviderHoldings,
} from "@/lib/wallet-inventory/adapters/solana";
import {
  coerceAssetStandard,
  holdingIdentityKey,
  InventoryProviderMissingError,
  InventorySyncFailedError,
  stableCollectionId,
  WalletDisconnectedError,
  WalletPendingError,
  WalletRevokedError,
  type NormalizedHolding,
} from "@/lib/wallet-inventory/domain";
import {
  normalizeContractAddress,
  normalizeInventoryAddress,
  normalizeProviderHolding,
} from "@/lib/wallet-inventory/normalization";
import {
  createWalletInventoryProviderRegistry,
  type ProviderInventoryItem,
  type WalletInventoryProvider,
} from "@/lib/wallet-inventory/providers";
import {
  createInMemoryWalletInventoryRepository,
  type WalletInventoryRepository,
} from "@/lib/wallet-inventory/repository";
import {
  assertWalletEligibleForInventorySync,
  createWalletInventoryService,
} from "@/lib/wallet-inventory/service";

function createStaticProvider(
  namespace: "eip155" | "solana",
  items: readonly ProviderInventoryItem[],
  providerKey = `${namespace}-static`
): WalletInventoryProvider {
  return {
    providerKey,
    chainNamespace: namespace,
    async fetchHoldings() {
      return { provider: providerKey, items: Object.freeze([...items]) };
    },
  };
}

async function createVerifiedWallet(
  profileWallets = createInMemoryProfileWalletRepository(),
  input: {
    profileId?: string;
    chainNamespace?: "eip155" | "solana";
    address?: string;
  } = {}
) {
  const created = await profileWallets.createWallet({
    profileId: input.profileId ?? "profile-inventory",
    chainNamespace: input.chainNamespace ?? "eip155",
    address: input.address ?? "0xAbCdEf1234567890",
    role: "connected",
  });
  const verified = await profileWallets.markWalletVerified(created.id);
  return { profileWallets, wallet: verified };
}

function item(
  overrides: Partial<ProviderInventoryItem> &
    Pick<ProviderInventoryItem, "contractAddress" | "tokenId">
): ProviderInventoryItem {
  return {
    assetStandard: "erc721",
    quantity: "1",
    collectionId: null,
    acquiredAt: null,
    ...overrides,
  };
}

test("repository contract exposes required inventory methods", () => {
  const repository: WalletInventoryRepository =
    createInMemoryWalletInventoryRepository();
  assert.equal(typeof repository.upsertHoldings, "function");
  assert.equal(typeof repository.listHoldingsByWallet, "function");
  assert.equal(typeof repository.listHoldingsByWallets, "function");
  assert.equal(typeof repository.listHoldingsByCollection, "function");
  assert.equal(typeof repository.removeHoldingsNotIn, "function");
  assert.equal(typeof repository.replaceWalletInventory, "function");
  assert.equal(typeof repository.startSync, "function");
  assert.equal(typeof repository.completeSync, "function");
  assert.equal(typeof repository.findLatestSync, "function");
  assert.equal(typeof repository.updateSyncStatus, "function");
});

test("provider abstraction registry resolves EVM and Solana adapters", () => {
  const evm = createEvmInventoryProvider({ providerKey: "evm-test" });
  const solana = createSolanaInventoryProvider({ providerKey: "sol-test" });
  const registry = createWalletInventoryProviderRegistry([evm, solana]);

  assert.equal(registry.get("eip155")?.providerKey, "evm-test");
  assert.equal(registry.get("solana")?.providerKey, "sol-test");
  assert.equal(registry.list().length, 2);
});

test("EVM normalization maps ERC721/ERC1155 and drops provider collection IDs", () => {
  const raw: EvmProviderNftHolding = {
    contract: { address: "0xABC", tokenType: "ERC721" },
    tokenId: "42",
    balance: "1",
    collection: { slug: "cool-cats", id: "provider-col-1" },
    acquiredAt: { blockTimestamp: "2024-01-01T00:00:00.000Z" },
  };

  const normalized = normalizeEvmProviderHolding(raw);
  assert.ok(normalized);
  assert.equal(normalized.assetStandard, "erc721");
  assert.equal(normalized.collectionId, null);

  const erc1155 = normalizeEvmProviderHolding({
    contractAddress: "0xdef",
    tokenId: "7",
    tokenType: "ERC1155",
    balance: 3,
  });
  assert.equal(erc1155?.assetStandard, "erc1155");
  assert.equal(erc1155?.quantity, "3");

  assert.equal(
    normalizeEvmProviderHoldings([{ tokenId: "missing-contract" }]).length,
    0
  );
});

test("Solana normalization supports standard and programmable NFTs", () => {
  const standard = normalizeSolanaProviderHolding({
    mint: "SoLmint111",
    amount: 1,
    collection: { address: "provider-collection" },
    interface: "V1_NFT",
  });
  assert.ok(standard);
  assert.equal(standard.assetStandard, "solana_nft");
  assert.equal(standard.collectionId, null);

  const pnft = normalizeSolanaProviderHolding({
    mint: "SoLpnft222",
    tokenStandard: "ProgrammableNonFungible",
  });
  assert.equal(pnft?.assetStandard, "solana_pnft");

  assert.equal(normalizeSolanaProviderHoldings([{ amount: 1 }]).length, 0);
});

test("unknown asset standard is stored as unknown rather than rejected", () => {
  assert.equal(coerceAssetStandard("something-weird"), "unknown");
  assert.equal(coerceAssetStandard("ERC721"), "erc721");
  assert.equal(coerceAssetStandard("pnft"), "solana_pnft");
});

test("address normalization lowercases EVM and preserves Solana casing", () => {
  assert.equal(
    normalizeInventoryAddress("eip155", "0xAbCdEf"),
    "0xabcdef"
  );
  assert.equal(
    normalizeContractAddress("eip155", "0xABCDef"),
    "0xabcdef"
  );
  assert.equal(
    normalizeInventoryAddress("solana", "  SoLAddressXx  "),
    "SoLAddressXx"
  );
  assert.equal(
    normalizeContractAddress("solana", "MintCaseSensitive"),
    "MintCaseSensitive"
  );
});

test("collection identity uses chainNamespace + contractAddress only", async () => {
  const { wallet } = await createVerifiedWallet();
  const normalized = normalizeProviderHolding(
    item({
      contractAddress: "0xFFFF",
      tokenId: "5",
      collectionId: "provider-should-be-ignored",
    }),
    {
      wallet,
      sourceProvider: "test",
      lastSeenAt: "2026-07-25T12:00:00.000Z",
    }
  );
  assert.equal(normalized.collectionId, "eip155:0xffff");
  assert.equal(
    normalized.collectionId,
    stableCollectionId("eip155", normalized.contractAddress)
  );
});

test("verified wallet sync persists normalized holdings and sync metadata", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({
          contractAddress: "0xContractOne",
          tokenId: "1",
          acquiredAt: "2024-02-02T00:00:00.000Z",
        }),
      ]),
    ]),
  });

  const now = new Date("2026-07-25T15:00:00.000Z");
  const result = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
    now,
  });

  assert.equal(result.sync.syncStatus, "success");
  assert.equal(result.sync.provider, "eip155-static");
  assert.equal(result.sync.syncStartedAt, now.toISOString());
  assert.equal(result.sync.syncCompletedAt, now.toISOString());
  assert.equal(result.sync.durationMs, 0);
  assert.equal(result.sync.errorMessage, null);
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].contractAddress, "0xcontractone");
  assert.equal(result.holdings[0].collectionId, "eip155:0xcontractone");
  assert.equal(result.writtenCount, 1);
  assert.equal(result.removedCount, 0);
});

test("pending wallet rejection returns WalletPendingError", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const pending = await profileWallets.createWallet({
    profileId: "profile-pending",
    chainNamespace: "eip155",
    address: "0xPending",
    role: "connected",
    verificationStatus: "pending",
  });

  assert.throws(
    () => assertWalletEligibleForInventorySync(pending),
    WalletPendingError
  );

  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", []),
    ]),
  });

  await assert.rejects(
    () => service.syncVerifiedWalletInventory({ walletId: pending.id }),
    (error: unknown) =>
      error instanceof WalletPendingError && error.code === "wallet_pending"
  );
});

test("revoked wallet rejection returns WalletRevokedError", async () => {
  const profileWallets = createInMemoryProfileWalletRepository();
  const created = await profileWallets.createWallet({
    profileId: "profile-revoked",
    chainNamespace: "eip155",
    address: "0xRevoked",
    role: "connected",
  });
  const revoked = await profileWallets.updateWalletVerificationStatus(
    created.id,
    "revoked"
  );

  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", []),
    ]),
  });

  await assert.rejects(
    () => service.syncVerifiedWalletInventory({ walletId: revoked.id }),
    WalletRevokedError
  );
});

test("disconnected wallet rejection returns WalletDisconnectedError", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    profileId: "profile-disconnected",
    address: "0xDisconnected",
  });
  const disconnected = await profileWallets.markWalletDisconnected(wallet.id);

  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", []),
    ]),
  });

  await assert.rejects(
    () => service.syncVerifiedWalletInventory({ walletId: disconnected.id }),
    WalletDisconnectedError
  );
});

test("repeated identical sync is idempotent with no timestamp churn", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xIdempotent",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  const providers = createWalletInventoryProviderRegistry([
    createStaticProvider("eip155", [
      item({ contractAddress: "0xAbC", tokenId: "1" }),
    ]),
  ]);
  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers,
  });

  const first = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
    now: new Date("2026-07-25T10:00:00.000Z"),
  });
  const second = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
    now: new Date("2026-07-25T11:00:00.000Z"),
  });

  assert.equal(first.holdings.length, 1);
  assert.equal(second.holdings.length, 1);
  assert.equal(first.holdings[0].id, second.holdings[0].id);
  assert.equal(second.writtenCount, 0);
  assert.equal(second.removedCount, 0);
  assert.equal(first.holdings[0].lastSeenAt, second.holdings[0].lastSeenAt);
  assert.equal(first.holdings[0].updatedAt, second.holdings[0].updatedAt);
  assert.equal(first.holdings[0].createdAt, second.holdings[0].createdAt);

  const listed = await service.listHoldingsByWallet(wallet.id);
  assert.equal(listed.length, 1);
});

test("duplicate holding upsert does not create a second row", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  const base = {
    walletId: "wallet-dup",
    chainNamespace: "eip155" as const,
    contractAddress: "0xabc",
    tokenId: "1",
    assetStandard: "erc721" as const,
    quantity: "1",
    collectionId: "eip155:0xabc",
    ownerAddress: "0xowner",
    acquiredAt: null,
    lastSeenAt: "2026-07-25T10:00:00.000Z",
    sourceProvider: "evm-test",
  };

  const first = await inventory.upsertHoldings([base]);
  const second = await inventory.upsertHoldings([
    { ...base, lastSeenAt: "2026-07-25T11:00:00.000Z" },
  ]);

  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].lastSeenAt, first[0].lastSeenAt);
  assert.equal((await inventory.listHoldingsByWallet("wallet-dup")).length, 1);
});

test("address casing differences do not create duplicate holdings", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xCaseFold",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const serviceA = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({ contractAddress: "0xAbCd", tokenId: "9" }),
      ]),
    ]),
  });
  await serviceA.syncVerifiedWalletInventory({ walletId: wallet.id });

  const serviceB = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({ contractAddress: "0xabcd", tokenId: "9" }),
      ]),
    ]),
  });
  const second = await serviceB.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  assert.equal(second.holdings.length, 1);
  assert.equal(second.writtenCount, 0);
  assert.equal(second.holdings[0].contractAddress, "0xabcd");
});

test("ERC1155 quantity updates rewrite the same holding row", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xErc1155",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const firstService = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({
          contractAddress: "0x1155",
          tokenId: "3",
          assetStandard: "erc1155",
          quantity: "1",
        }),
      ]),
    ]),
  });
  const first = await firstService.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  const secondService = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({
          contractAddress: "0x1155",
          tokenId: "3",
          assetStandard: "erc1155",
          quantity: "8",
        }),
      ]),
    ]),
  });
  const second = await secondService.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  assert.equal(first.holdings[0].id, second.holdings[0].id);
  assert.equal(second.holdings[0].quantity, "8");
  assert.equal(second.writtenCount, 1);
  assert.equal((await inventory.listHoldingsByWallet(wallet.id)).length, 1);
});

test("removed holding cleanup deletes identities no longer present", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xCleanup",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider(
        "eip155",
        [
          item({ contractAddress: "0xA", tokenId: "1" }),
          item({ contractAddress: "0xB", tokenId: "2" }),
        ],
        "cleanup-provider"
      ),
    ]),
  });
  await service.syncVerifiedWalletInventory({ walletId: wallet.id });

  const serviceOnlyA = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider(
        "eip155",
        [item({ contractAddress: "0xA", tokenId: "1" })],
        "cleanup-provider"
      ),
    ]),
  });
  const result = await serviceOnlyA.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  assert.equal(result.removedCount, 1);
  const remaining = await serviceOnlyA.listHoldingsByWallet(wallet.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].contractAddress, "0xa");
});

test("interrupted sync preserves previous inventory and skips stale cleanup", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xInterrupt",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const okService = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({ contractAddress: "0xKeep", tokenId: "1" }),
        item({ contractAddress: "0xAlso", tokenId: "2" }),
      ]),
    ]),
  });
  await okService.syncVerifiedWalletInventory({ walletId: wallet.id });
  const before = await inventory.listHoldingsByWallet(wallet.id);
  assert.equal(before.length, 2);

  let removeCalls = 0;
  const originalRemove = inventory.removeHoldingsNotIn.bind(inventory);
  inventory.removeHoldingsNotIn = async (walletId, keepKeys) => {
    removeCalls += 1;
    return originalRemove(walletId, keepKeys);
  };

  const failing: WalletInventoryProvider = {
    providerKey: "failing",
    chainNamespace: "eip155",
    async fetchHoldings() {
      throw new Error("provider interrupted mid-page");
    },
  };

  const failService = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([failing]),
  });

  await assert.rejects(
    () => failService.syncVerifiedWalletInventory({ walletId: wallet.id }),
    InventorySyncFailedError
  );

  const after = await inventory.listHoldingsByWallet(wallet.id);
  assert.equal(after.length, 2);
  assert.deepEqual(
    after.map((h) => h.contractAddress).sort(),
    before.map((h) => h.contractAddress).sort()
  );
  assert.equal(removeCalls, 0);

  const latest = await inventory.findLatestSync(wallet.id);
  assert.equal(latest?.syncStatus, "failure");
  assert.equal(latest?.errorMessage, "provider interrupted mid-page");
  assert.ok(latest?.durationMs != null);
});

test("replace failure rolls back and does not delete prior holdings", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  await inventory.replaceWalletInventory({
    walletId: "wallet-atomic",
    holdings: [
      {
        walletId: "wallet-atomic",
        chainNamespace: "eip155",
        contractAddress: "0xabc",
        tokenId: "1",
        assetStandard: "erc721",
        quantity: "1",
        collectionId: "eip155:0xabc",
        ownerAddress: "0xowner",
        acquiredAt: null,
        lastSeenAt: "2026-07-25T10:00:00.000Z",
        sourceProvider: "test",
      },
    ],
  });

  await assert.rejects(
    () =>
      inventory.replaceWalletInventory({
        walletId: "wallet-atomic",
        holdings: [
          {
            walletId: "wallet-other",
            chainNamespace: "eip155",
            contractAddress: "0xdef",
            tokenId: "2",
            assetStandard: "erc721",
            quantity: "1",
            collectionId: "eip155:0xdef",
            ownerAddress: "0xowner",
            acquiredAt: null,
            lastSeenAt: "2026-07-25T11:00:00.000Z",
            sourceProvider: "test",
          },
        ],
      }),
    /does not match replace target/
  );

  const listed = await inventory.listHoldingsByWallet("wallet-atomic");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].contractAddress, "0xabc");
});

test("empty wallet sync clears previous holdings", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xEmpty",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const filled = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [
        item({ contractAddress: "0xGone", tokenId: "1" }),
      ]),
    ]),
  });
  await filled.syncVerifiedWalletInventory({ walletId: wallet.id });

  const emptied = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", []),
    ]),
  });
  const result = await emptied.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  assert.equal(result.holdings.length, 0);
  assert.equal(result.removedCount, 1);
  assert.equal((await emptied.listHoldingsByWallet(wallet.id)).length, 0);
  assert.equal(result.sync.syncStatus, "success");
});

test("Solana verified wallet sync uses Solana adapter path", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    profileId: "profile-sol",
    chainNamespace: "solana",
    address: "SoLOwnerAddress111",
  });

  const solanaProvider = createSolanaInventoryProvider({
    providerKey: "solana-live-stub",
    fetchRawHoldings: async () => [
      {
        mint: "MintAAA",
        amount: "1",
        interface: "ProgrammableNFT",
      },
    ],
  });

  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([solanaProvider]),
  });

  const result = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });

  assert.equal(result.holdings[0].assetStandard, "solana_pnft");
  assert.equal(result.holdings[0].collectionId, "solana:MintAAA");
  assert.equal(result.holdings[0].ownerAddress, "SoLOwnerAddress111");
});

test("EVM adapter provider returns normalized items only", async () => {
  const provider = createEvmInventoryProvider({
    providerKey: "alchemy-shaped",
    fetchRawHoldings: async () => [
      {
        contract: { address: "0xEeEe", tokenType: "ERC1155" },
        id: { tokenId: "99" },
        balance: "4",
      },
    ],
  });

  const result = await provider.fetchHoldings({
    chainNamespace: "eip155",
    ownerAddress: "0xowner",
  });

  assert.equal(result.items[0].assetStandard, "erc1155");
  assert.equal(
    "contract" in (result.items[0] as unknown as Record<string, unknown>),
    false
  );
});

test("normalizeProviderHolding fills internal asset model fields only", async () => {
  const { wallet } = await createVerifiedWallet();
  const normalized = normalizeProviderHolding(
    item({
      contractAddress: "0xFFFF",
      tokenId: "5",
      assetStandard: "unknown",
    }),
    {
      wallet,
      sourceProvider: "test",
      lastSeenAt: "2026-07-25T12:00:00.000Z",
    }
  );

  assert.equal(normalized.assetStandard, "unknown");
  assert.equal(
    "floorPrice" in (normalized as unknown as Record<string, unknown>),
    false
  );
  assert.equal(
    "rarity" in (normalized as unknown as Record<string, unknown>),
    false
  );
});

test("missing provider for namespace fails with InventoryProviderMissingError", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([]),
  });

  await assert.rejects(
    () => service.syncVerifiedWalletInventory({ walletId: wallet.id }),
    InventoryProviderMissingError
  );
});

test("wallet with 10,000+ holdings syncs with performance sanity bounds", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xPerf",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  const items: ProviderInventoryItem[] = [];
  for (let i = 0; i < 10_000; i += 1) {
    items.push(
      item({
        contractAddress: `0x${(i % 256).toString(16).padStart(2, "0")}${"ab".repeat(19)}`,
        tokenId: String(i),
        assetStandard: i % 2 === 0 ? "erc721" : "erc1155",
        quantity: i % 2 === 0 ? "1" : String((i % 5) + 1),
      })
    );
  }

  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", items, "perf-provider"),
    ]),
  });

  const started = Date.now();
  const first = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });
  const firstElapsed = Date.now() - started;

  assert.equal(first.holdings.length, 10_000);
  assert.equal(first.writtenCount, 10_000);
  assert.ok(
    firstElapsed < 5_000,
    `expected first 10k sync under 5s, took ${firstElapsed}ms`
  );

  const secondStarted = Date.now();
  const second = await service.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });
  const secondElapsed = Date.now() - secondStarted;

  assert.equal(second.holdings.length, 10_000);
  assert.equal(second.writtenCount, 0);
  assert.equal(second.removedCount, 0);
  assert.ok(
    secondElapsed < 5_000,
    `expected idempotent 10k sync under 5s, took ${secondElapsed}ms`
  );
});

test("holdingIdentityKey is stable for unique constraint semantics", () => {
  const holding: Pick<
    NormalizedHolding,
    "walletId" | "chainNamespace" | "contractAddress" | "tokenId"
  > = {
    walletId: "w1",
    chainNamespace: "eip155",
    contractAddress: "0xabc",
    tokenId: "1",
  };
  assert.equal(holdingIdentityKey(holding), "w1:eip155:0xabc:1");
});

test("updateSyncStatus repository method updates status, duration, and error", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  const sync = await inventory.startSync({
    walletId: "wallet-status",
    provider: "test",
    syncStartedAt: "2026-07-25T10:00:00.000Z",
  });
  const updated = await inventory.completeSync({
    syncId: sync.id,
    syncStatus: "failure",
    syncCompletedAt: "2026-07-25T10:00:01.500Z",
    errorMessage: "boom",
  });
  assert.equal(updated.syncStatus, "failure");
  assert.equal(updated.errorMessage, "boom");
  assert.equal(updated.durationMs, 1500);
});
