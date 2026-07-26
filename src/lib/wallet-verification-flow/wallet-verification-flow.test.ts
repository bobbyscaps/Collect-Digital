import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { VerifyWalletFlowView } from "@/components/collector-identity/verify-wallet-flow-view";
import {
  NO_VERIFIED_WALLETS_DESCRIPTION,
  NO_VERIFIED_WALLETS_TITLE,
  hasNoVerifiedWallets,
} from "@/components/collector-identity/no-verified-wallets";
import { createAuthenticatedProfileContext } from "@/lib/wallet-verification/auth-context";
import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import { createInMemoryWalletVerificationChallengeRepository } from "@/lib/wallet-verification/repository";
import { createInMemoryCompleteWalletVerification } from "@/lib/wallet-verification/completion";
import { createDefaultSignatureVerifier } from "@/lib/wallet-verification/verifiers/create-signature-verifier";
import { createInMemoryWalletInventoryRepository } from "@/lib/wallet-inventory/repository";
import {
  createWalletInventoryProviderRegistry,
  type WalletInventoryProvider,
} from "@/lib/wallet-inventory/providers";
import { createEvmInventoryProvider } from "@/lib/wallet-inventory/adapters/evm";
import { createSolanaInventoryProvider } from "@/lib/wallet-inventory/adapters/solana";
import { createWalletRegistrationService } from "@/lib/wallet-registration/service";
import {
  WalletRegistrationOwnershipConflictError,
} from "@/lib/wallet-registration/domain";
import {
  handleCreateVerificationChallenge,
  handleRegisterWallet,
  handleSyncWalletInventory,
  handleVerifyWalletOwnership,
} from "@/lib/wallet-verification-flow/http";
import type { WalletVerificationFlowServices } from "@/lib/wallet-verification-flow/wiring";
import { createWalletVerificationService } from "@/lib/wallet-verification/service";
import { createWalletInventoryService } from "@/lib/wallet-inventory/service";
import {
  buildSelectableWallet,
  dedupeSelectableWallets,
  shortenWalletAddress,
} from "@/lib/wallet-verification-flow/connected-wallets";
import {
  OWNERSHIP_REASSURANCE,
  PHASE_LABELS,
  isUserCancellationError,
  type WalletVerificationUiPhase,
} from "@/lib/wallet-verification-flow/flow-states";
import {
  registerWallet,
  createWalletVerificationChallenge,
  verifyWalletOwnership,
  syncVerifiedWalletInventory,
  WalletVerificationFlowClientError,
} from "@/lib/wallet-verification-flow/client";
import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";
import { createCollectorIdentityService } from "@/lib/collector-identity/compose";
import { createCollectorAnalysisService } from "@/lib/collector-analysis/service";

function auth(profileId: string) {
  return createAuthenticatedProfileContext(profileId);
}

function createFlowStack(input?: {
  providers?: ReturnType<typeof createWalletInventoryProviderRegistry>;
}) {
  const profileWallets = createInMemoryProfileWalletRepository();
  const challenges = createInMemoryWalletVerificationChallengeRepository();
  const inventory = createInMemoryWalletInventoryRepository();
  const providers =
    input?.providers ??
    createWalletInventoryProviderRegistry([
      createEvmInventoryProvider({ providerKey: "evm-test" }),
      createSolanaInventoryProvider({ providerKey: "sol-test" }),
    ]);

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
      providers,
    }),
  };

  return { profileWallets, challenges, inventory, providers, services };
}

function requireAuthOk(profileId: string) {
  return async () =>
    ({
      ok: true as const,
      privyUserId: profileId,
      auth: auth(profileId),
    }) as const;
}

function requireAuthFail() {
  return async () =>
    ({
      ok: false as const,
      status: 401,
      code: "authentication_required" as const,
      message: "Authentication required.",
    }) as const;
}

async function jsonRequest(body: unknown): Promise<Request> {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function renderPhase(
  phase: WalletVerificationUiPhase,
  overrides: Partial<{
    connectedWallets: ReturnType<typeof buildSelectableWallet>[];
    selectedKey: string | null;
    errorMessage: string | null;
    challengeMessage: string | null;
  }> = {}
) {
  const wallets =
    overrides.connectedWallets ??
    [
      buildSelectableWallet({
        address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
        chainNamespace: "eip155",
        label: "MetaMask",
      }),
    ];
  return renderToStaticMarkup(
    React.createElement(VerifyWalletFlowView, {
      phase,
      connectedWallets: wallets,
      selectedKey: overrides.selectedKey ?? wallets[0]?.key ?? null,
      onSelectWallet: () => undefined,
      onVerify: () => undefined,
      onRetrySync: () => undefined,
      onReset: () => undefined,
      errorMessage: overrides.errorMessage ?? null,
      challengeMessage: overrides.challengeMessage ?? null,
      authenticated: true,
      walletsReady: true,
    })
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test("authenticated wallet registration creates pending wallet", async () => {
  const { services } = createFlowStack();
  const response = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.created, true);
  assert.equal(body.wallet.verificationStatus, "pending");
  assert.equal(body.wallet.verifiedAt, null);
  assert.equal(body.wallet.role, "connected");
  assert.equal(
    body.wallet.normalizedAddress,
    "0xabcdef1234567890abcdef1234567890abcdef12"
  );
});

test("unauthenticated registration is rejected", async () => {
  const { services } = createFlowStack();
  const response = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthFail() }
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "authentication_required");
});

test("duplicate registration reuses existing wallet for same profile", async () => {
  const { services } = createFlowStack();
  const deps = {
    services,
    requireAuth: requireAuthOk("did:privy:user-1"),
  };
  const first = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
      role: "login",
    }),
    deps
  );
  const firstBody = await first.json();

  const second = await handleRegisterWallet(
    await jsonRequest({
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      chainNamespace: "eip155",
      role: "connected",
    }),
    deps
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.created, false);
  assert.equal(secondBody.wallet.walletId, firstBody.wallet.walletId);
  // Role preserved from first registration.
  assert.equal(secondBody.wallet.role, "login");
  assert.equal(secondBody.wallet.verificationStatus, "pending");
});

test("wallet already owned by another profile returns ownership conflict", async () => {
  const { services, profileWallets } = createFlowStack();
  await profileWallets.createWallet({
    profileId: "did:privy:other",
    chainNamespace: "eip155",
    address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
    role: "connected",
  });

  const response = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "wallet_ownership_conflict");
});

test("EVM address normalization lowercases before register", async () => {
  const { services, profileWallets } = createFlowStack();
  await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const found = await profileWallets.findWalletByChainAndAddress(
    "eip155",
    "0xabcdef1234567890abcdef1234567890abcdef12"
  );
  assert.ok(found);
  assert.equal(
    found.normalizedAddress,
    "0xabcdef1234567890abcdef1234567890abcdef12"
  );
});

test("Solana address preservation keeps base58 casing", async () => {
  const { services } = createFlowStack();
  const address = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const response = await handleRegisterWallet(
    await jsonRequest({ address, chainNamespace: "solana" }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const body = await response.json();
  assert.equal(body.wallet.normalizedAddress, address);
  assert.equal(body.wallet.address, address);
});

test("registration service throws ownership conflict domain error", async () => {
  const { profileWallets } = createFlowStack();
  const registration = createWalletRegistrationService({ profileWallets });
  await registration.registerWallet(auth("profile-a"), {
    address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
    chainNamespace: "eip155",
  });
  await assert.rejects(
    () =>
      registration.registerWallet(auth("profile-b"), {
        address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
        chainNamespace: "eip155",
      }),
    WalletRegistrationOwnershipConflictError
  );
});

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

test("challenge generation returns canonical message for authenticated wallet", async () => {
  const { services } = createFlowStack();
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  const response = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.walletId, registered.wallet.walletId);
  assert.match(body.message, /Collect Digital Wallet Ownership Verification/);
  assert.match(body.message, /does not initiate a blockchain transaction/);
  assert.match(body.message, /does not grant spending permissions/);
  assert.match(body.message, new RegExp(registered.wallet.walletId));
  assert.match(body.message, /eip155/);
  assert.ok(body.challengeId);
  assert.ok(body.expiresAt);
});

test("challenge tied to authenticated profile rejects other profiles", async () => {
  const { services } = createFlowStack();
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  const response = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:intruder") }
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "wallet_profile_mismatch");
});

test("expired challenge is rejected on verify", async () => {
  const { services, challenges } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  const { challenge, message } = await services.verification.createChallenge(
    auth("did:privy:user-1"),
    {
      walletId: registered.wallet.walletId,
      ttlMs: 1,
      now: new Date("2026-01-01T00:00:00.000Z"),
    }
  );

  // Force expiry in repository by consuming timeline.
  const signature = await account.signMessage({ message });
  const response = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.id,
      signature,
      address: account.address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );

  // Challenge findActiveChallenge returns null / expired → mapped error.
  assert.ok(response.status >= 400);
  const body = await response.json();
  assert.ok(
    body.error.code === "expired_challenge" ||
      body.error.code === "challenge_not_found"
  );
  void challenges;
});

test("consumed challenge cannot be reused", async () => {
  const { services } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();
  const signature = await account.signMessage({ message: challenge.message });

  const first = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address: account.address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(first.status, 200);

  const second = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address: account.address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.ok(second.status >= 400);
  const body = await second.json();
  assert.ok(
    body.error.code === "consumed_challenge" ||
      body.error.code === "challenge_not_found"
  );
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

test("successful EVM verification marks wallet verified and preserves role", async () => {
  const { services, profileWallets } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
      role: "login",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();
  const signature = await account.signMessage({ message: challenge.message });

  const verifyResponse = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address: account.address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(verifyResponse.status, 200);
  const body = await verifyResponse.json();
  assert.equal(body.wallet.verificationStatus, "verified");
  assert.equal(body.wallet.role, "login");
  assert.equal(body.inventorySync.status, "skipped");

  const stored = await profileWallets.findWalletById(registered.wallet.walletId);
  assert.equal(stored?.verificationStatus, "verified");
  assert.equal(stored?.role, "login");
});

test("successful Solana verification marks wallet verified", async () => {
  const { services } = createFlowStack();
  const keyPair = nacl.sign.keyPair();
  const address = bs58.encode(keyPair.publicKey);

  const register = await handleRegisterWallet(
    await jsonRequest({ address, chainNamespace: "solana" }),
    { services, requireAuth: requireAuthOk("did:privy:user-sol") }
  );
  const registered = await register.json();

  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-sol") }
  );
  const challenge = await challengeResponse.json();
  const signature = bs58.encode(
    nacl.sign.detached(
      new TextEncoder().encode(challenge.message),
      keyPair.secretKey
    )
  );

  const verifyResponse = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-sol") }
  );
  assert.equal(verifyResponse.status, 200);
  const body = await verifyResponse.json();
  assert.equal(body.wallet.verificationStatus, "verified");
});

test("invalid signature returns invalid_signature", async () => {
  const { services } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();
  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();

  const response = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature:
        "0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "invalid_signature");
});

test("wrong wallet address returns wrong_wallet", async () => {
  const { services } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();
  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();
  const signature = await account.signMessage({ message: challenge.message });

  const response = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
      address: other.address,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "wrong_wallet");
});

test("profile tampering via wrong auth is rejected", async () => {
  const { services } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();
  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();
  const signature = await account.signMessage({ message: challenge.message });

  const response = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
    }),
    { services, requireAuth: requireAuthOk("did:privy:attacker") }
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "wallet_profile_mismatch");
});

test("already verified wallet skips signature when re-registered", async () => {
  const { services, profileWallets } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());
  const created = await profileWallets.createWallet({
    profileId: "did:privy:user-1",
    chainNamespace: "eip155",
    address: account.address,
    role: "connected",
  });
  await profileWallets.markWalletVerified(created.id);

  const response = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const body = await response.json();
  assert.equal(body.created, false);
  assert.equal(body.wallet.verificationStatus, "verified");
});

test("user cancellation helper detects rejection errors", () => {
  assert.equal(
    isUserCancellationError(new Error("User rejected the request")),
    true
  );
  assert.equal(isUserCancellationError(new Error("network down")), false);
});

// ---------------------------------------------------------------------------
// Inventory sync
// ---------------------------------------------------------------------------

test("verification followed by successful sync refreshes collector identity", async () => {
  const { services, profileWallets, inventory } = createFlowStack();
  const account = privateKeyToAccount(generatePrivateKey());

  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();
  const challengeResponse = await handleCreateVerificationChallenge(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const challenge = await challengeResponse.json();
  const signature = await account.signMessage({ message: challenge.message });

  const verifyResponse = await handleVerifyWalletOwnership(
    await jsonRequest({
      walletId: registered.wallet.walletId,
      challengeId: challenge.challengeId,
      signature,
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(verifyResponse.status, 200);

  const syncResponse = await handleSyncWalletInventory(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(syncResponse.status, 200);
  const syncBody = await syncResponse.json();
  assert.equal(syncBody.inventorySync.status, "success");
  assert.equal(syncBody.wallet.verificationStatus, "verified");

  const analysis = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const identity = createCollectorIdentityService({
    profileWallets,
    inventory,
    analysis,
  });
  const me = await identity.getMyIdentity(auth("did:privy:user-1"));
  assert.equal(me.wallets.state, "live");
  assert.equal(me.wallets.data?.verifiedWalletCount, 1);
});

test("verification succeeds but sync failure preserves verified status and holdings", async () => {
  const failingProvider: WalletInventoryProvider = {
    providerKey: "failing-evm",
    chainNamespace: "eip155",
    async fetchHoldings() {
      throw new Error("provider unavailable");
    },
  };
  const { services, profileWallets, inventory } = createFlowStack({
    providers: createWalletInventoryProviderRegistry([
      failingProvider,
      createSolanaInventoryProvider({ providerKey: "sol-test" }),
    ]),
  });

  const account = privateKeyToAccount(generatePrivateKey());
  const register = await handleRegisterWallet(
    await jsonRequest({
      address: account.address,
      chainNamespace: "eip155",
    }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const registered = await register.json();

  // Seed previous inventory before sync failure path.
  await profileWallets.markWalletVerified(registered.wallet.walletId);
  await inventory.replaceWalletInventory({
    walletId: registered.wallet.walletId,
    holdings: [
      {
        walletId: registered.wallet.walletId,
        chainNamespace: "eip155",
        contractAddress: "0x1111111111111111111111111111111111111111",
        tokenId: "1",
        assetStandard: "erc721",
        quantity: "1",
        collectionId: "eip155:0x1111111111111111111111111111111111111111",
        ownerAddress: account.address.toLowerCase(),
        acquiredAt: null,
        lastSeenAt: "2026-07-25T12:00:00.000Z",
        sourceProvider: "seed",
      },
    ],
  });

  const before = await inventory.listHoldingsByWallet(registered.wallet.walletId);
  assert.equal(before.length, 1);

  const syncResponse = await handleSyncWalletInventory(
    await jsonRequest({ walletId: registered.wallet.walletId }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  assert.equal(syncResponse.status, 200);
  const syncBody = await syncResponse.json();
  assert.equal(syncBody.inventorySync.status, "failure");
  assert.equal(syncBody.inventorySync.previousInventoryPreserved, true);
  assert.equal(syncBody.wallet.verificationStatus, "verified");

  const after = await inventory.listHoldingsByWallet(registered.wallet.walletId);
  assert.equal(after.length, 1);
  assert.equal(after[0].tokenId, "1");

  const wallet = await profileWallets.findWalletById(registered.wallet.walletId);
  assert.equal(wallet?.verificationStatus, "verified");
});

test("retry sync can succeed after failure", async () => {
  let shouldFail = true;
  const flakyProvider: WalletInventoryProvider = {
    providerKey: "flaky-evm",
    chainNamespace: "eip155",
    async fetchHoldings() {
      if (shouldFail) throw new Error("temporary outage");
      return { provider: "flaky-evm", items: [] };
    },
  };
  const { services, profileWallets } = createFlowStack({
    providers: createWalletInventoryProviderRegistry([
      flakyProvider,
      createSolanaInventoryProvider({ providerKey: "sol-test" }),
    ]),
  });

  const created = await profileWallets.createWallet({
    profileId: "did:privy:user-1",
    chainNamespace: "eip155",
    address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
    role: "connected",
  });
  await profileWallets.markWalletVerified(created.id);

  const failResponse = await handleSyncWalletInventory(
    await jsonRequest({ walletId: created.id }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const failBody = await failResponse.json();
  assert.equal(failBody.inventorySync.status, "failure");

  shouldFail = false;
  const okResponse = await handleSyncWalletInventory(
    await jsonRequest({ walletId: created.id }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const okBody = await okResponse.json();
  assert.equal(okBody.inventorySync.status, "success");
  assert.equal(okBody.wallet.verificationStatus, "verified");
});

// ---------------------------------------------------------------------------
// Client boundary
// ---------------------------------------------------------------------------

test("typed client registerWallet maps errors without stack traces", async () => {
  await assert.rejects(
    () =>
      registerWallet({
        accessToken: "token",
        address: "0xabc",
        chainNamespace: "eip155",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "authentication_required",
                message: "Authentication required.",
              },
            }),
            { status: 401 }
          ),
      }),
    (error: unknown) => {
      assert.ok(error instanceof WalletVerificationFlowClientError);
      assert.equal(error.code, "authentication_required");
      assert.equal(error.message.includes("at "), false);
      return true;
    }
  );
});

test("typed client validates challenge / verify / sync responses", async () => {
  const challenge = await createWalletVerificationChallenge({
    accessToken: "token",
    walletId: "w1",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          challengeId: "c1",
          walletId: "w1",
          chainNamespace: "eip155",
          normalizedAddress: "0xabc",
          expiresAt: "2026-07-26T00:00:00.000Z",
          message: "Collect Digital Wallet Ownership Verification",
        })
      ),
  });
  assert.equal(challenge.challengeId, "c1");

  const verified = await verifyWalletOwnership({
    accessToken: "token",
    walletId: "w1",
    challengeId: "c1",
    signature: "0xsig",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          wallet: {
            walletId: "w1",
            chainNamespace: "eip155",
            address: "0xAbC",
            normalizedAddress: "0xabc",
            role: "connected",
            verificationStatus: "verified",
            verifiedAt: "2026-07-26T00:00:00.000Z",
            disconnectedAt: null,
          },
          inventorySync: {
            status: "skipped",
            syncId: null,
            errorMessage: null,
            writtenCount: null,
            removedCount: null,
            previousInventoryPreserved: true,
          },
        })
      ),
  });
  assert.equal(verified.wallet.verificationStatus, "verified");

  const synced = await syncVerifiedWalletInventory({
    accessToken: "token",
    walletId: "w1",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          wallet: verified.wallet,
          inventorySync: {
            status: "success",
            syncId: "s1",
            errorMessage: null,
            writtenCount: 0,
            removedCount: 0,
            previousInventoryPreserved: false,
          },
        })
      ),
  });
  assert.equal(synced.inventorySync.status, "success");
});

// ---------------------------------------------------------------------------
// UI states
// ---------------------------------------------------------------------------

const UI_PHASES: WalletVerificationUiPhase[] = [
  "ready",
  "registering",
  "awaiting_signature",
  "verifying",
  "verified",
  "synchronizing",
  "complete",
  "cancelled",
  "verification_failed",
  "sync_failed",
];

for (const phase of UI_PHASES) {
  test(`UI VerifyWalletFlowView renders ${phase} state`, () => {
    const html = renderPhase(phase, {
      errorMessage:
        phase === "verification_failed"
          ? "Invalid signature"
          : phase === "sync_failed"
            ? "provider unavailable"
            : phase === "cancelled"
              ? "Wallet verification was cancelled."
              : null,
      challengeMessage:
        phase === "awaiting_signature"
          ? "Collect Digital Wallet Ownership Verification\n\nNonce: abc"
          : null,
    });

    assert.match(html, new RegExp(`data-phase="${phase}"`));
    assert.match(html, new RegExp(PHASE_LABELS[phase].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(html.toLowerCase().includes("calculating your collector"), false);
    assert.equal(html.toLowerCase().includes("collection score"), false);
    assert.equal(html.includes("floorPrice"), false);
    assert.match(html, /data-testid="verify-wallet-no-scoring"/);
  });
}

test("UI wallet selection shows chain and shortened address", () => {
  const wallets = [
    buildSelectableWallet({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
      label: "MetaMask",
    }),
    buildSelectableWallet({
      address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      chainNamespace: "solana",
      label: "Phantom",
    }),
  ];
  const html = renderPhase("ready", {
    connectedWallets: wallets,
    selectedKey: null,
  });
  assert.match(html, /data-testid="verify-wallet-selection"/);
  assert.match(html, /EVM/);
  assert.match(html, /Solana/);
  assert.match(html, new RegExp(shortenWalletAddress(wallets[0].address)));
});

test("UI awaiting-signature shows reassurance and canonical message", () => {
  const html = renderPhase("awaiting_signature", {
    challengeMessage: "Collect Digital Wallet Ownership Verification\nNonce: xyz",
  });
  assert.match(html, /data-testid="verify-wallet-reassurance"/);
  assert.match(html, new RegExp(OWNERSHIP_REASSURANCE));
  assert.match(html, /data-testid="verify-wallet-canonical-message"/);
  assert.match(html, /Nonce: xyz/);
  assert.match(html, /no blockchain transaction/);
});

test("UI sync failure shows Retry Sync", () => {
  const html = renderPhase("sync_failed", {
    errorMessage: "provider unavailable",
  });
  assert.match(html, /data-testid="retry-sync-action"/);
  assert.match(html, /Retry Sync/);
  assert.match(html, /provider unavailable/);
});

test("UI complete state has no fabricated metrics", () => {
  const html = renderPhase("complete");
  assert.match(html, /Your Collector Identity is ready/);
  assert.equal(html.includes("Elite Flipper"), false);
  assert.equal(html.includes("Collection Score"), false);
  assert.equal(html.includes("%"), false);
});

test("dedupeSelectableWallets collapses duplicate EVM casings", () => {
  const wallets = dedupeSelectableWallets([
    buildSelectableWallet({
      address: "0xAbCdEf1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
    buildSelectableWallet({
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
      chainNamespace: "eip155",
    }),
  ]);
  assert.equal(wallets.length, 1);
});

test("empty-state helpers remain for progressive profile", () => {
  assert.ok(NO_VERIFIED_WALLETS_TITLE.length > 0);
  assert.ok(NO_VERIFIED_WALLETS_DESCRIPTION.length > 0);
  const emptyIdentity = {
    wallets: { state: "empty", data: null, lastUpdatedAt: null, message: "x" },
  } as CollectorIdentityResponse;
  assert.equal(hasNoVerifiedWallets(emptyIdentity), true);
});

// ---------------------------------------------------------------------------
// Regression / boundaries
// ---------------------------------------------------------------------------

test("frontend client and UI do not import repositories or verification services", () => {
  const client = readFileSync(
    path.join(process.cwd(), "src/lib/wallet-verification-flow/client.ts"),
    "utf8"
  );
  const flow = readFileSync(
    path.join(
      process.cwd(),
      "src/components/collector-identity/verify-wallet-flow.tsx"
    ),
    "utf8"
  );
  const view = readFileSync(
    path.join(
      process.cwd(),
      "src/components/collector-identity/verify-wallet-flow-view.tsx"
    ),
    "utf8"
  );

  for (const source of [client, flow, view]) {
    assert.equal(source.includes("supabase-repository"), false);
    assert.equal(source.includes("createWalletVerificationService"), false);
    assert.equal(source.includes("createWalletInventoryService"), false);
    assert.equal(source.includes("createWalletRegistrationService"), false);
  }
});

test("profile header wires Verify Wallet flow with identity refresh", () => {
  const header = readFileSync(
    path.join(process.cwd(), "src/components/profile/profile-header.tsx"),
    "utf8"
  );
  assert.match(header, /NoVerifiedWalletsEmptyState/);
  assert.match(header, /onIdentityRefresh=\{refreshIdentity\}/);
  assert.match(header, /onSessionActiveChange=\{setVerificationSessionActive\}/);
  assert.match(header, /verificationSessionActive/);
  assert.equal(header.includes("Coming next"), false);
});

test("routes exist for register, challenge, verify, and sync", () => {
  for (const relative of [
    "src/app/api/wallets/register/route.ts",
    "src/app/api/wallets/verification/challenge/route.ts",
    "src/app/api/wallets/verification/verify/route.ts",
    "src/app/api/wallets/inventory/sync/route.ts",
  ]) {
    const source = readFileSync(path.join(process.cwd(), relative), "utf8");
    assert.match(source, /export async function POST/);
  }
});

test("error responses do not include stack traces", async () => {
  const { services } = createFlowStack();
  const response = await handleRegisterWallet(
    await jsonRequest({ address: "", chainNamespace: "eip155" }),
    { services, requireAuth: requireAuthOk("did:privy:user-1") }
  );
  const body = await response.json();
  assert.equal(typeof body.error.code, "string");
  assert.equal(typeof body.error.message, "string");
  assert.equal(JSON.stringify(body).includes("    at "), false);
});
