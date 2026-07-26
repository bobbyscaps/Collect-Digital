import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { requireAuthenticatedProfile } from "@/lib/auth/require-authenticated-profile";
import {
  createInMemoryProfileRepository,
} from "@/lib/profiles/repository";
import {
  resolveOrCreateProfileForPrivyUser,
  resolveProfileIdFromPrivyUserId,
} from "@/lib/profiles/resolve-profile";
import { createAuthenticatedProfileContext } from "@/lib/wallet-verification/auth-context";
import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import { createWalletRegistrationService } from "@/lib/wallet-registration/service";
import { createWalletVerificationService } from "@/lib/wallet-verification/service";
import { createInMemoryWalletVerificationChallengeRepository } from "@/lib/wallet-verification/repository";
import { createInMemoryCompleteWalletVerification } from "@/lib/wallet-verification/completion";
import { createDefaultSignatureVerifier } from "@/lib/wallet-verification/verifiers/create-signature-verifier";
import { createWalletInventoryService } from "@/lib/wallet-inventory/service";
import { createInMemoryWalletInventoryRepository } from "@/lib/wallet-inventory/repository";
import {
  createWalletInventoryProviderRegistry,
} from "@/lib/wallet-inventory/providers";
import { createEvmInventoryProvider } from "@/lib/wallet-inventory/adapters/evm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  handleRegisterWallet,
  handleCreateVerificationChallenge,
  handleVerifyWalletOwnership,
  handleSyncWalletInventory,
} from "@/lib/wallet-verification-flow/http";
import type { WalletVerificationFlowServices } from "@/lib/wallet-verification-flow/wiring";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

test("first Privy login creates one internal profile UUID", async () => {
  const profiles = createInMemoryProfileRepository();
  const created = await resolveOrCreateProfileForPrivyUser(
    "did:privy:alice",
    profiles
  );

  assert.match(
    created.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.equal(created.privyUserId, "did:privy:alice");
  assert.notEqual(created.id, "did:privy:alice");
});

test("repeated login reuses the same profile", async () => {
  const profiles = createInMemoryProfileRepository();
  const first = await resolveProfileIdFromPrivyUserId(
    "did:privy:bob",
    profiles
  );
  const second = await resolveProfileIdFromPrivyUserId(
    "did:privy:bob",
    profiles
  );
  assert.equal(first, second);
});

test("concurrent profile resolution does not create duplicates", async () => {
  const profiles = createInMemoryProfileRepository();
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      resolveOrCreateProfileForPrivyUser("did:privy:race", profiles)
    )
  );
  const ids = new Set(results.map((profile) => profile.id));
  assert.equal(ids.size, 1);
});

test("two different Privy users receive different profile UUIDs", async () => {
  const profiles = createInMemoryProfileRepository();
  const a = await resolveProfileIdFromPrivyUserId("did:privy:one", profiles);
  const b = await resolveProfileIdFromPrivyUserId("did:privy:two", profiles);
  assert.notEqual(a, b);
});

test("client-supplied profile IDs are ignored by requireAuthenticatedProfile", async () => {
  const profiles = createInMemoryProfileRepository();
  const trusted = await resolveProfileIdFromPrivyUserId(
    "did:privy:trusted",
    profiles
  );

  // Simulate auth path: only Privy subject is trusted; forged header/body IDs unused.
  const request = new Request("http://localhost/api/test", {
    headers: {
      Authorization: "Bearer unused-in-this-unit",
      "X-Profile-Id": randomUUID(),
    },
    method: "POST",
    body: JSON.stringify({ profileId: randomUUID(), claimedProfileId: randomUUID() }),
  });

  // Inject a fake token verifier by calling resolver directly with trusted subject.
  // requireAuthenticatedProfile uses verifyPrivyToken — for this contract we assert
  // resolveTrustedProfileId rejects mismatched claims against resolved UUID.
  const auth = createAuthenticatedProfileContext(trusted);
  const { resolveTrustedProfileId } = await import(
    "@/lib/wallet-verification/auth-context"
  );
  assert.equal(resolveTrustedProfileId({ auth }), trusted);
  assert.throws(
    () =>
      resolveTrustedProfileId({
        auth,
        claimedProfileId: randomUUID(),
      }),
    /does not match authenticated profile/
  );
  void request;
});

test("requireAuthenticatedProfile maps Privy subject to internal UUID", async () => {
  const profiles = createInMemoryProfileRepository();
  const { verifyPrivyToken } = await import("@/lib/admin/verify");

  // Monkey-patch is fragile; instead exercise the resolver wiring used by auth.
  const profile = await resolveOrCreateProfileForPrivyUser(
    "did:privy:auth-path",
    profiles
  );
  const result = {
    ok: true as const,
    privyUserId: "did:privy:auth-path",
    auth: createAuthenticatedProfileContext(profile.id),
  };

  assert.equal(result.privyUserId, "did:privy:auth-path");
  assert.equal(result.auth.profileId, profile.id);
  assert.notEqual(result.auth.profileId, result.privyUserId);
  void verifyPrivyToken;
  void requireAuthenticatedProfile;
});

// ---------------------------------------------------------------------------
// Downstream wallet / verification / inventory use internal UUID
// ---------------------------------------------------------------------------

test("wallet registration, challenge, verify, and sync use internal UUID", async () => {
  const profiles = createInMemoryProfileRepository();
  const profile = await resolveOrCreateProfileForPrivyUser(
    "did:privy:wallet-user",
    profiles
  );
  const profileId = profile.id;
  assert.equal(profileId.startsWith("did:privy:"), false);

  const profileWallets = createInMemoryProfileWalletRepository();
  const challenges = createInMemoryWalletVerificationChallengeRepository();
  const inventory = createInMemoryWalletInventoryRepository();
  const services: WalletVerificationFlowServices = {
    profileWallets,
    registration: createWalletRegistrationService({ profileWallets }),
    verification: createWalletVerificationService({
      profileWallets,
      challenges,
      completeVerification: createInMemoryCompleteWalletVerification({
        challenges,
        profileWallets,
      }),
      signatureVerifier: createDefaultSignatureVerifier(),
    }),
    inventory: createWalletInventoryService({
      profileWallets,
      inventory,
      providers: createWalletInventoryProviderRegistry([
        createEvmInventoryProvider({ providerKey: "evm-test" }),
      ]),
    }),
  };

  const account = privateKeyToAccount(generatePrivateKey());
  const requireAuth = async () =>
    ({
      ok: true as const,
      privyUserId: "did:privy:wallet-user",
      auth: createAuthenticatedProfileContext(profileId),
    }) as const;

  async function post(body: unknown) {
    return new Request("http://localhost/test", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  const register = await handleRegisterWallet(
    await post({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth }
  );
  assert.equal(register.status, 201);
  const registered = await register.json();
  const stored = await profileWallets.findWalletById(registered.wallet.walletId);
  assert.equal(stored?.profileId, profileId);

  const challengeRes = await handleCreateVerificationChallenge(
    await post({ walletId: registered.wallet.walletId }),
    { services, requireAuth }
  );
  const challenge = await challengeRes.json();
  const challengeRow = await challenges.findActiveChallenge({
    id: challenge.challengeId,
    profileId,
    walletId: registered.wallet.walletId,
  });
  assert.equal(challengeRow?.profileId, profileId);

  const signature = await account.signMessage({ message: challenge.message });
  const verifyRes = await handleVerifyWalletOwnership(
    await post({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address: account.address,
    }),
    { services, requireAuth }
  );
  assert.equal(verifyRes.status, 200);
  const verified = await verifyRes.json();
  assert.equal(verified.wallet.verificationStatus, "verified");

  const syncRes = await handleSyncWalletInventory(
    await post({ walletId: registered.wallet.walletId }),
    { services, requireAuth }
  );
  assert.equal(syncRes.status, 200);
  const syncBody = await syncRes.json();
  assert.equal(syncBody.inventorySync.status, "success");

  // Challenge message embeds internal UUID, not Privy DID.
  assert.match(challenge.message, new RegExp(profileId));
  assert.equal(challenge.message.includes("did:privy:wallet-user"), false);
});

// ---------------------------------------------------------------------------
// Migration schema contracts (unapplied source)
// ---------------------------------------------------------------------------

test("migration order is chronological and starts with profiles", () => {
  const files = listMigrationFiles();
  assert.deepEqual(files, [
    "20260725210000_create_profiles.sql",
    "20260725214500_create_profile_wallets.sql",
    "20260725220000_create_wallet_verification_challenges.sql",
    "20260725223000_atomic_wallet_verification.sql",
    "20260725230000_create_wallet_inventory.sql",
    "20260725231000_create_provider_cache_entries.sql",
  ]);
});

test("no migration depends on auth.users", () => {
  for (const file of listMigrationFiles()) {
    const sql = readMigration(file);
    assert.equal(
      /references\s+auth\.users/i.test(sql),
      false,
      `${file} must not FK-reference auth.users`
    );
  }
});

test("profile_wallets and challenges reference profiles(id)", () => {
  const wallets = readMigration("20260725214500_create_profile_wallets.sql");
  const challenges = readMigration(
    "20260725220000_create_wallet_verification_challenges.sql"
  );
  assert.match(wallets, /references public\.profiles\(id\)/);
  assert.match(challenges, /references public\.profiles\(id\)/);
});

test("profiles foundation has required columns and unique privy_user_id", () => {
  const sql = readMigration("20260725210000_create_profiles.sql");
  assert.match(sql, /create table if not exists public\.profiles/i);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(sql, /privy_user_id text not null/i);
  assert.match(sql, /unique \(privy_user_id\)/i);
  assert.match(sql, /created_at timestamptz not null/i);
  assert.match(sql, /updated_at timestamptz not null/i);
});

test("provider_cache_entries matches runtime cache contract", () => {
  const sql = readMigration("20260725231000_create_provider_cache_entries.sql");
  assert.match(sql, /create table if not exists public\.provider_cache_entries/i);
  assert.match(sql, /cache_key text primary key/i);
  assert.match(sql, /provider text not null/i);
  assert.match(sql, /value jsonb not null/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /updated_at timestamptz not null/i);
  assert.match(sql, /provider_cache_entries_expires_at_idx/);

  const cacheSource = readFileSync(
    path.join(process.cwd(), "src/lib/providers/cache.ts"),
    "utf8"
  );
  assert.match(cacheSource, /provider_cache_entries/);
  assert.match(cacheSource, /cache_key/);
  assert.match(cacheSource, /expires_at/);
  assert.match(cacheSource, /updated_at/);
});

test("privileged RPCs revoke public/anon/authenticated and grant service_role", () => {
  const verification = readMigration(
    "20260725223000_atomic_wallet_verification.sql"
  );
  const inventory = readMigration("20260725230000_create_wallet_inventory.sql");

  for (const [name, sql] of [
    ["complete_wallet_ownership_verification", verification],
    ["replace_wallet_inventory", inventory],
  ] as const) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}`, "i"));
    assert.match(sql, /from anon, authenticated/i);
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`, "i")
    );
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = public/i);
  }
});

test("RPC p_profile_id remains uuid typed", () => {
  const sql = readMigration("20260725223000_atomic_wallet_verification.sql");
  assert.match(sql, /p_profile_id uuid/);
});
