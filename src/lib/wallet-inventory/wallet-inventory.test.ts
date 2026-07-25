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
  holdingIdentityKey,
  InventoryProviderMissingError,
  InventorySyncFailedError,
  WalletDisconnectedError,
  WalletPendingError,
  WalletRevokedError,
  type NormalizedHolding,
} from "@/lib/wallet-inventory/domain";
import { normalizeProviderHolding } from "@/lib/wallet-inventory/normalization";
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

test("repository contract exposes required inventory methods", () => {
  const repository: WalletInventoryRepository =
    createInMemoryWalletInventoryRepository();
  assert.equal(typeof repository.upsertHoldings, "function");
  assert.equal(typeof repository.listHoldingsByWallet, "function");
  assert.equal(typeof repository.removeHoldingsNotIn, "function");
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
  assert.equal(evm.chainNamespace, "eip155");
  assert.equal(solana.chainNamespace, "solana");
});

test("EVM normalization maps provider-specific payload to inventory items", () => {
  const raw: EvmProviderNftHolding = {
    contract: { address: "0xABC", tokenType: "ERC721" },
    tokenId: "42",
    balance: "1",
    collection: { slug: "cool-cats" },
    acquiredAt: { blockTimestamp: "2024-01-01T00:00:00.000Z" },
  };

  const item = normalizeEvmProviderHolding(raw);
  assert.ok(item);
  assert.equal(item.contractAddress, "0xABC");
  assert.equal(item.tokenId, "42");
  assert.equal(item.assetStandard, "erc721");
  assert.equal(item.quantity, "1");
  assert.equal(item.collectionId, "cool-cats");
  assert.equal(item.acquiredAt, "2024-01-01T00:00:00.000Z");

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

test("Solana normalization maps mint-based holdings without metadata enrichment", () => {
  const item = normalizeSolanaProviderHolding({
    mint: "SoLmint111",
    amount: 1,
    collection: { address: "SoLcollection" },
    acquiredAt: "2025-06-01T12:00:00.000Z",
  });
  assert.ok(item);
  assert.equal(item.contractAddress, "SoLmint111");
  assert.equal(item.tokenId, "SoLmint111");
  assert.equal(item.assetStandard, "spl_nft");
  assert.equal(item.collectionId, "SoLcollection");
  assert.equal(item.quantity, "1");

  assert.equal(
    normalizeSolanaProviderHoldings([{ amount: 1 }]).length,
    0
  );
});

test("verified wallet sync persists normalized holdings and sync success", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet();
  const inventory = createInMemoryWalletInventoryRepository();
  const providers = createWalletInventoryProviderRegistry([
    createStaticProvider("eip155", [
      {
        contractAddress: "0xContractOne",
        tokenId: "1",
        assetStandard: "erc721",
        quantity: "1",
        collectionId: "collection-a",
        acquiredAt: "2024-02-02T00:00:00.000Z",
      },
    ]),
  ]);

  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers,
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
  assert.equal(result.sync.errorMessage, null);
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].walletId, wallet.id);
  assert.equal(result.holdings[0].chainNamespace, "eip155");
  assert.equal(result.holdings[0].contractAddress, "0xcontractone");
  assert.equal(result.holdings[0].tokenId, "1");
  assert.equal(result.holdings[0].ownerAddress, wallet.normalizedAddress);
  assert.equal(result.holdings[0].sourceProvider, "eip155-static");
  assert.equal(result.removedCount, 0);

  const listed = await service.listHoldingsByWallet(wallet.id);
  assert.equal(listed.length, 1);
  const latest = await service.getLatestSync(wallet.id);
  assert.equal(latest?.syncStatus, "success");
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

  assert.throws(
    () => assertWalletEligibleForInventorySync(revoked),
    WalletRevokedError
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
    (error: unknown) =>
      error instanceof WalletRevokedError && error.code === "wallet_revoked"
  );
});

test("disconnected wallet rejection returns WalletDisconnectedError", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    profileId: "profile-disconnected",
    address: "0xDisconnected",
  });
  const disconnected = await profileWallets.markWalletDisconnected(wallet.id);

  assert.throws(
    () => assertWalletEligibleForInventorySync(disconnected),
    WalletDisconnectedError
  );

  const service = createWalletInventoryService({
    profileWallets,
    inventory: createInMemoryWalletInventoryRepository(),
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", []),
    ]),
  });

  await assert.rejects(
    () =>
      service.syncVerifiedWalletInventory({ walletId: disconnected.id }),
    (error: unknown) =>
      error instanceof WalletDisconnectedError &&
      error.code === "wallet_disconnected"
  );
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
    collectionId: null,
    ownerAddress: "0xowner",
    acquiredAt: null,
    lastSeenAt: "2026-07-25T10:00:00.000Z",
    sourceProvider: "evm-test",
  };

  const first = await inventory.upsertHoldings([base]);
  const second = await inventory.upsertHoldings([
    { ...base, lastSeenAt: "2026-07-25T11:00:00.000Z" },
  ]);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].lastSeenAt, "2026-07-25T11:00:00.000Z");

  const listed = await inventory.listHoldingsByWallet("wallet-dup");
  assert.equal(listed.length, 1);
});

test("removed holding cleanup deletes identities no longer present", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xCleanup",
  });
  const inventory = createInMemoryWalletInventoryRepository();

  const itemA: ProviderInventoryItem = {
    contractAddress: "0xA",
    tokenId: "1",
    assetStandard: "erc721",
    quantity: "1",
    collectionId: null,
    acquiredAt: null,
  };
  const itemB: ProviderInventoryItem = {
    contractAddress: "0xB",
    tokenId: "2",
    assetStandard: "erc721",
    quantity: "1",
    collectionId: null,
    acquiredAt: null,
  };

  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [itemA, itemB], "cleanup-provider"),
    ]),
  });

  await service.syncVerifiedWalletInventory({ walletId: wallet.id });
  assert.equal((await service.listHoldingsByWallet(wallet.id)).length, 2);

  const serviceOnlyA = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([
      createStaticProvider("eip155", [itemA], "cleanup-provider"),
    ]),
  });

  const result = await serviceOnlyA.syncVerifiedWalletInventory({
    walletId: wallet.id,
  });
  assert.equal(result.removedCount, 1);
  const remaining = await serviceOnlyA.listHoldingsByWallet(wallet.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].contractAddress, "0xa");
  assert.equal(remaining[0].tokenId, "1");
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
        collection: "CollAAA",
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

  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].chainNamespace, "solana");
  assert.equal(result.holdings[0].assetStandard, "spl_nft");
  assert.equal(result.holdings[0].contractAddress, "MintAAA");
  assert.equal(result.holdings[0].ownerAddress, "SoLOwnerAddress111");
  assert.equal(result.sync.provider, "solana-live-stub");
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

  assert.equal(result.provider, "alchemy-shaped");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].contractAddress, "0xEeEe");
  assert.equal(result.items[0].tokenId, "99");
  assert.equal(result.items[0].assetStandard, "erc1155");
  // Ensure result is the provider-independent shape (no raw contract object).
  assert.equal(
    "contract" in (result.items[0] as unknown as Record<string, unknown>),
    false
  );
});

test("normalizeProviderHolding fills internal asset model fields only", async () => {
  const { wallet } = await createVerifiedWallet();
  const normalized = normalizeProviderHolding(
    {
      contractAddress: "0xFFFF",
      tokenId: "5",
      assetStandard: "erc721",
      quantity: "1",
      collectionId: "c1",
      acquiredAt: null,
    },
    {
      wallet,
      sourceProvider: "test",
      lastSeenAt: "2026-07-25T12:00:00.000Z",
    }
  );

  const keys = Object.keys(normalized).sort();
  assert.deepEqual(keys, [
    "acquiredAt",
    "assetStandard",
    "chainNamespace",
    "collectionId",
    "contractAddress",
    "lastSeenAt",
    "ownerAddress",
    "quantity",
    "sourceProvider",
    "tokenId",
    "walletId",
  ]);
  assert.equal(normalized.contractAddress, "0xffff");
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

test("provider fetch failure records sync failure status", async () => {
  const { profileWallets, wallet } = await createVerifiedWallet(undefined, {
    address: "0xFail",
  });
  const inventory = createInMemoryWalletInventoryRepository();
  const failing: WalletInventoryProvider = {
    providerKey: "failing",
    chainNamespace: "eip155",
    async fetchHoldings() {
      throw new Error("upstream timeout");
    },
  };

  const service = createWalletInventoryService({
    profileWallets,
    inventory,
    providers: createWalletInventoryProviderRegistry([failing]),
  });

  await assert.rejects(
    () => service.syncVerifiedWalletInventory({ walletId: wallet.id }),
    InventorySyncFailedError
  );

  const latest = await inventory.findLatestSync(wallet.id);
  assert.equal(latest?.syncStatus, "failure");
  assert.equal(latest?.errorMessage, "upstream timeout");
  assert.ok(latest?.syncCompletedAt);
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

test("updateSyncStatus repository method updates status and error", async () => {
  const inventory = createInMemoryWalletInventoryRepository();
  const sync = await inventory.startSync({
    walletId: "wallet-status",
    provider: "test",
  });
  const updated = await inventory.updateSyncStatus(
    sync.id,
    "failure",
    "boom"
  );
  assert.equal(updated.syncStatus, "failure");
  assert.equal(updated.errorMessage, "boom");
  assert.ok(updated.syncCompletedAt);
});
