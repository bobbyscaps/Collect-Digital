import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionWalletRole,
  canTransitionWalletVerificationStatus,
} from "@/lib/profile-wallets/domain";
import {
  normalizeWalletAddress,
  normalizeWalletAddressOrThrow,
  ProfileWalletNormalizationError,
} from "@/lib/profile-wallets/normalization";
import {
  createInMemoryProfileWalletRepository,
  ProfileWalletOwnershipConflictError,
  type ProfileWalletRepository,
} from "@/lib/profile-wallets/repository";

test("normalizes EVM addresses to lowercase", () => {
  assert.equal(
    normalizeWalletAddress("eip155", "0xAbCdEf1234"),
    "0xabcdef1234"
  );
});

test("preserves Solana address case exactly (with whitespace trimmed)", () => {
  assert.equal(
    normalizeWalletAddress("solana", "  9xQeWvG816bUx9EPfZs8vwNa8ovfCLo8k2fM8k2rU2kP "),
    "9xQeWvG816bUx9EPfZs8vwNa8ovfCLo8k2fM8k2rU2kP"
  );
});

test("rejects unsupported namespaces", () => {
  assert.throws(
    () => normalizeWalletAddressOrThrow("bitcoin", "1abc"),
    ProfileWalletNormalizationError
  );
});

test("repository prevents duplicate wallet ownership across profiles", async () => {
  const repository = createInMemoryProfileWalletRepository();
  await repository.createWallet({
    profileId: "profile-a",
    chainNamespace: "eip155",
    address: "0xAbCd",
    role: "login",
  });

  await assert.rejects(
    () =>
      repository.createWallet({
        profileId: "profile-b",
        chainNamespace: "eip155",
        address: "0xabcd",
        role: "connected",
      }),
    ProfileWalletOwnershipConflictError
  );
});

test("repository contract typing exposes required methods", () => {
  const repository: ProfileWalletRepository = createInMemoryProfileWalletRepository();
  assert.equal(typeof repository.createWallet, "function");
  assert.equal(typeof repository.findWalletByChainAndAddress, "function");
  assert.equal(typeof repository.listWalletsByProfile, "function");
  assert.equal(typeof repository.updateWalletRole, "function");
  assert.equal(typeof repository.updateWalletVerificationStatus, "function");
  assert.equal(typeof repository.markWalletDisconnected, "function");
});

test("role transitions remain unrestricted across valid enum values", async () => {
  assert.equal(canTransitionWalletRole("login", "primary"), true);
  assert.equal(canTransitionWalletRole("primary", "login"), true);
  assert.equal(canTransitionWalletRole("connected", "primary"), true);

  const repository = createInMemoryProfileWalletRepository();
  const created = await repository.createWallet({
    profileId: "profile-role",
    chainNamespace: "eip155",
    address: "0xRole",
    role: "login",
  });

  const promoted = await repository.updateWalletRole(created.id, "primary");
  assert.equal(promoted.role, "primary");
  const relogin = await repository.updateWalletRole(promoted.id, "login");
  assert.equal(relogin.role, "login");
});

test("verification transitions permit reverification and keep revoked wallets auditable", async () => {
  assert.equal(canTransitionWalletVerificationStatus("pending", "verified"), true);
  assert.equal(canTransitionWalletVerificationStatus("verified", "pending"), true);
  assert.equal(canTransitionWalletVerificationStatus("revoked", "verified"), true);

  const repository = createInMemoryProfileWalletRepository();
  const created = await repository.createWallet({
    profileId: "profile-verify",
    chainNamespace: "solana",
    address: "SoLAddress",
    role: "connected",
    verificationStatus: "pending",
  });

  const verified = await repository.updateWalletVerificationStatus(
    created.id,
    "verified"
  );
  assert.equal(verified.verificationStatus, "verified");
  assert.ok(verified.verifiedAt);

  const revoked = await repository.updateWalletVerificationStatus(verified.id, "revoked");
  assert.equal(revoked.verificationStatus, "revoked");
  assert.equal(revoked.verifiedAt, null);

  const reverified = await repository.updateWalletVerificationStatus(
    verified.id,
    "verified"
  );
  assert.equal(reverified.verificationStatus, "verified");
  assert.ok(reverified.verifiedAt);

  const disconnected = await repository.markWalletDisconnected(reverified.id);
  assert.ok(disconnected.disconnectedAt);

  const listed = await repository.listWalletsByProfile("profile-verify");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].verificationStatus, "verified");
  assert.ok(listed[0].disconnectedAt);
});
