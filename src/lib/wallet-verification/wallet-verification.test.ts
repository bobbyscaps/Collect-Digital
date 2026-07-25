import assert from "node:assert/strict";
import test from "node:test";

import bs58 from "bs58";
import nacl from "tweetnacl";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  createInMemoryProfileWalletRepository,
  type ProfileWalletRepository,
} from "@/lib/profile-wallets/repository";
import {
  createAuthenticatedProfileContext,
  resolveTrustedProfileId,
} from "@/lib/wallet-verification/auth-context";
import { buildWalletOwnershipChallengeMessage } from "@/lib/wallet-verification/challenge-message";
import { createInMemoryCompleteWalletVerification } from "@/lib/wallet-verification/completion";
import {
  ConsumedChallengeError,
  ExpiredChallengeError,
  InvalidSignatureError,
  UnsupportedNamespaceError,
  WalletProfileMismatchError,
  WrongWalletError,
} from "@/lib/wallet-verification/domain";
import {
  createChallengeNonce,
  createInMemoryWalletVerificationChallengeRepository,
  type WalletVerificationChallengeRepository,
} from "@/lib/wallet-verification/repository";
import { createWalletVerificationService } from "@/lib/wallet-verification/service";
import type { SignatureVerifier } from "@/lib/wallet-verification/signature-verifier";
import { createDefaultSignatureVerifier } from "@/lib/wallet-verification/verifiers/create-signature-verifier";

function auth(profileId: string) {
  return createAuthenticatedProfileContext(profileId);
}

function createService(overrides?: {
  signatureVerifier?: SignatureVerifier;
  profileWallets?: ProfileWalletRepository;
  challenges?: WalletVerificationChallengeRepository;
}) {
  const profileWallets =
    overrides?.profileWallets ?? createInMemoryProfileWalletRepository();
  const challenges =
    overrides?.challenges ?? createInMemoryWalletVerificationChallengeRepository();
  const service = createWalletVerificationService({
    profileWallets,
    challenges,
    signatureVerifier: overrides?.signatureVerifier,
    completeVerification: createInMemoryCompleteWalletVerification({
      challenges,
      profileWallets,
    }),
  });
  return { profileWallets, challenges, service };
}

test("challenge repository contract exposes required methods", () => {
  const repository: WalletVerificationChallengeRepository =
    createInMemoryWalletVerificationChallengeRepository();
  assert.equal(typeof repository.createChallenge, "function");
  assert.equal(typeof repository.findActiveChallenge, "function");
  assert.equal(typeof repository.consumeChallenge, "function");
});

test("secure nonce uniqueness uses cryptographically strong entropy", () => {
  const nonces = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const nonce = createChallengeNonce();
    assert.match(nonce, /^[a-f0-9]{64}$/);
    assert.equal(nonces.has(nonce), false);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 200);
});

test("creates a short-lived challenge tied to user, wallet, and namespace", async () => {
  const { profileWallets, service } = createService();
  const wallet = await profileWallets.createWallet({
    profileId: "profile-1",
    chainNamespace: "eip155",
    address: "0xAbC123",
    role: "connected",
  });

  const now = new Date("2026-07-25T12:00:00.000Z");
  const { challenge, message } = await service.createChallenge(auth("profile-1"), {
    walletId: wallet.id,
    ttlMs: 60_000,
    now,
  });

  assert.equal(challenge.profileId, "profile-1");
  assert.equal(challenge.walletId, wallet.id);
  assert.equal(challenge.chainNamespace, "eip155");
  assert.equal(challenge.consumedAt, null);
  assert.equal(challenge.expiresAt, "2026-07-25T12:01:00.000Z");
  assert.match(challenge.nonce, /^[a-f0-9]{64}$/);
  assert.match(message, /Collect Digital Wallet Ownership Verification/);
  assert.match(message, /does not initiate a blockchain transaction/);
  assert.match(message, new RegExp(`Wallet ID: ${wallet.id}`));
  assert.match(message, /Normalized Address: 0xabc123/);
  assert.match(message, /Issued At: /);
  assert.match(message, /Expires At: 2026-07-25T12:01:00.000Z/);
});

test("expired challenges are rejected with ExpiredChallengeError", async () => {
  const { profileWallets, challenges, service } = createService({
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-exp",
    chainNamespace: "eip155",
    address: "0xExpire",
    role: "connected",
  });

  const createdAt = new Date("2026-07-25T12:00:00.000Z");
  const { challenge } = await service.createChallenge(auth("profile-exp"), {
    walletId: wallet.id,
    ttlMs: 1_000,
    now: createdAt,
  });

  await assert.rejects(
    () =>
      challenges.findActiveChallenge({
        id: challenge.id,
        profileId: "profile-exp",
        walletId: wallet.id,
        now: new Date("2026-07-25T12:00:02.000Z"),
      }),
    ExpiredChallengeError
  );

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-exp"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xdead",
        now: new Date("2026-07-25T12:00:02.000Z"),
      }),
    ExpiredChallengeError
  );
});

test("consumed challenge cannot be reused", async () => {
  const { profileWallets, challenges, service } = createService({
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-reuse",
    chainNamespace: "eip155",
    address: "0xReuse",
    role: "primary",
  });

  const { challenge } = await service.createChallenge(auth("profile-reuse"), {
    walletId: wallet.id,
  });

  const first = await service.verifyOwnership(auth("profile-reuse"), {
    walletId: wallet.id,
    challengeId: challenge.id,
    signature: "0xany",
  });
  assert.equal(first.verificationStatus, "verified");
  assert.equal(first.role, "primary");

  await assert.rejects(
    () =>
      challenges.findActiveChallenge({
        id: challenge.id,
        profileId: "profile-reuse",
        walletId: wallet.id,
      }),
    ConsumedChallengeError
  );

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-reuse"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xany",
      }),
    ConsumedChallengeError
  );
});

test("two concurrent verification attempts against one challenge allow only one winner", async () => {
  const { profileWallets, challenges, service } = createService({
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-race",
    chainNamespace: "eip155",
    address: "0xRaceWallet",
    role: "connected",
  });
  const { challenge } = await service.createChallenge(auth("profile-race"), {
    walletId: wallet.id,
  });

  const results = await Promise.allSettled([
    service.verifyOwnership(auth("profile-race"), {
      walletId: wallet.id,
      challengeId: challenge.id,
      signature: "0xone",
    }),
    service.verifyOwnership(auth("profile-race"), {
      walletId: wallet.id,
      challengeId: challenge.id,
      signature: "0xtwo",
    }),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    rejected[0]?.status === "rejected" &&
      rejected[0].reason instanceof ConsumedChallengeError
  );

  const activeLookup = challenges.findActiveChallenge({
    id: challenge.id,
    profileId: "profile-race",
    walletId: wallet.id,
  });
  await assert.rejects(() => activeLookup, ConsumedChallengeError);

  const verified = await profileWallets.findWalletById(wallet.id);
  assert.equal(verified?.verificationStatus, "verified");
  assert.equal(verified?.role, "connected");
});

test("atomic rollback keeps challenge usable when wallet verification fails", async () => {
  const baseWallets = createInMemoryProfileWalletRepository();
  const challenges = createInMemoryWalletVerificationChallengeRepository();
  let failNextMark = false;
  const profileWallets: ProfileWalletRepository = {
    ...baseWallets,
    async markWalletVerified(id, verifiedAt) {
      if (failNextMark) {
        failNextMark = false;
        throw new Error("simulated wallet persistence failure");
      }
      return baseWallets.markWalletVerified(id, verifiedAt);
    },
  };

  const service = createWalletVerificationService({
    profileWallets,
    challenges,
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
    completeVerification: createInMemoryCompleteWalletVerification({
      challenges,
      profileWallets,
    }),
  });

  const wallet = await profileWallets.createWallet({
    profileId: "profile-rollback",
    chainNamespace: "eip155",
    address: "0xRollback",
    role: "login",
  });
  const { challenge } = await service.createChallenge(auth("profile-rollback"), {
    walletId: wallet.id,
  });

  failNextMark = true;
  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-rollback"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xsig",
      }),
    /simulated wallet persistence failure/
  );

  const stillActive = await challenges.findActiveChallenge({
    id: challenge.id,
    profileId: "profile-rollback",
    walletId: wallet.id,
  });
  assert.ok(stillActive);
  assert.equal(stillActive.consumedAt, null);

  const pending = await profileWallets.findWalletById(wallet.id);
  assert.equal(pending?.verificationStatus, "pending");
  assert.equal(pending?.role, "login");

  const verified = await service.verifyOwnership(auth("profile-rollback"), {
    walletId: wallet.id,
    challengeId: challenge.id,
    signature: "0xsig",
  });
  assert.equal(verified.verificationStatus, "verified");
  assert.equal(verified.role, "login");
});

test("message tampering fails signature verification against canonical message", async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const { profileWallets, service } = createService({
    signatureVerifier: createDefaultSignatureVerifier(),
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-tamper-msg",
    chainNamespace: "eip155",
    address: account.address,
    role: "connected",
  });
  const { challenge, message } = await service.createChallenge(
    auth("profile-tamper-msg"),
    { walletId: wallet.id }
  );

  const tampered = `${message}\nExtra: attacker-controlled`;
  const signature = await account.signMessage({ message: tampered });

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-tamper-msg"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature,
      }),
    InvalidSignatureError
  );
});

test("profileId tampering is rejected against trusted auth context", async () => {
  const { profileWallets, service } = createService({
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-owner",
    chainNamespace: "eip155",
    address: "0xOwner",
    role: "connected",
  });
  const { challenge } = await service.createChallenge(auth("profile-owner"), {
    walletId: wallet.id,
  });

  assert.throws(
    () =>
      resolveTrustedProfileId({
        auth: auth("profile-owner"),
        claimedProfileId: "profile-attacker",
      }),
    WalletProfileMismatchError
  );

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-owner"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xsig",
        claimedProfileId: "profile-attacker",
      }),
    WalletProfileMismatchError
  );

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-attacker"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xsig",
      }),
    WalletProfileMismatchError
  );
});

test("wallet-address tampering is rejected", async () => {
  const { profileWallets, service } = createService({
    signatureVerifier: {
      async verify() {
        return true;
      },
    },
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-wrong",
    chainNamespace: "eip155",
    address: "0xCorrectWallet",
    role: "connected",
  });
  const { challenge } = await service.createChallenge(auth("profile-wrong"), {
    walletId: wallet.id,
  });

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-wrong"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xsig",
        address: "0xDifferentWallet",
      }),
    WrongWalletError
  );
});

test("chain-namespace tampering fails against the canonical server message", async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const { profileWallets, service } = createService({
    signatureVerifier: createDefaultSignatureVerifier(),
  });
  const wallet = await profileWallets.createWallet({
    profileId: "profile-ns",
    chainNamespace: "eip155",
    address: account.address,
    role: "connected",
  });
  const { challenge, message } = await service.createChallenge(auth("profile-ns"), {
    walletId: wallet.id,
  });

  assert.match(message, /Chain Namespace: eip155/);
  const tamperedNamespaceMessage = message.replace(
    "Chain Namespace: eip155",
    "Chain Namespace: solana"
  );
  assert.notEqual(tamperedNamespaceMessage, message);

  const signature = await account.signMessage({
    message: tamperedNamespaceMessage,
  });
  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-ns"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature,
      }),
    InvalidSignatureError
  );

  // Canonical reconstruction remains bound to the persisted challenge namespace.
  const canonical = buildWalletOwnershipChallengeMessage({ challenge, wallet });
  assert.match(canonical, /Chain Namespace: eip155/);
  assert.equal(challenge.chainNamespace, "eip155");
});

test("successful EVM personal_sign verification marks wallet verified", async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const { profileWallets, service } = createService({
    signatureVerifier: createDefaultSignatureVerifier(),
  });

  const wallet = await profileWallets.createWallet({
    profileId: "profile-evm",
    chainNamespace: "eip155",
    address: account.address,
    role: "login",
  });

  const { challenge, message } = await service.createChallenge(auth("profile-evm"), {
    walletId: wallet.id,
  });
  const signature = await account.signMessage({ message });

  const verified = await service.verifyOwnership(auth("profile-evm"), {
    walletId: wallet.id,
    challengeId: challenge.id,
    signature,
    address: account.address,
  });

  assert.equal(verified.verificationStatus, "verified");
  assert.ok(verified.verifiedAt);
  assert.equal(verified.role, "login");
});

test("successful Solana signMessage verification marks wallet verified", async () => {
  const keyPair = nacl.sign.keyPair();
  const address = bs58.encode(keyPair.publicKey);
  const { profileWallets, service } = createService({
    signatureVerifier: createDefaultSignatureVerifier(),
  });

  const wallet = await profileWallets.createWallet({
    profileId: "profile-sol",
    chainNamespace: "solana",
    address,
    role: "connected",
  });

  const { challenge, message } = await service.createChallenge(auth("profile-sol"), {
    walletId: wallet.id,
  });
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey)
  );

  const verified = await service.verifyOwnership(auth("profile-sol"), {
    walletId: wallet.id,
    challengeId: challenge.id,
    signature,
    address,
  });

  assert.equal(verified.verificationStatus, "verified");
  assert.ok(verified.verifiedAt);
  assert.equal(verified.role, "connected");
});

test("invalid signature raises InvalidSignatureError", async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const { profileWallets, service } = createService({
    signatureVerifier: createDefaultSignatureVerifier(),
  });

  const wallet = await profileWallets.createWallet({
    profileId: "profile-bad-sig",
    chainNamespace: "eip155",
    address: account.address,
    role: "connected",
  });

  const { challenge } = await service.createChallenge(auth("profile-bad-sig"), {
    walletId: wallet.id,
  });

  await assert.rejects(
    () =>
      service.verifyOwnership(auth("profile-bad-sig"), {
        walletId: wallet.id,
        challengeId: challenge.id,
        signature:
          "0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
      }),
    InvalidSignatureError
  );

  const stillPending = await profileWallets.findWalletById(wallet.id);
  assert.equal(stillPending?.verificationStatus, "pending");
});

test("unsupported namespace raises UnsupportedNamespaceError", async () => {
  const verifier = createDefaultSignatureVerifier();
  await assert.rejects(
    () =>
      verifier.verify({
        chainNamespace: "bitcoin" as "eip155",
        address: "1abc",
        message: "nope",
        signature: "0x00",
      }),
    UnsupportedNamespaceError
  );
});

test("consumeChallenge rejects expired and already-consumed rows", async () => {
  const challenges = createInMemoryWalletVerificationChallengeRepository();
  const created = await challenges.createChallenge({
    profileId: "profile-consume",
    walletId: "wallet-consume",
    nonce: createChallengeNonce(),
    chainNamespace: "solana",
    expiresAt: "2026-07-25T12:00:01.000Z",
  });

  await assert.rejects(
    () => challenges.consumeChallenge(created.id, "2026-07-25T12:00:02.000Z"),
    ExpiredChallengeError
  );

  const active = await challenges.createChallenge({
    profileId: "profile-consume",
    walletId: "wallet-consume",
    nonce: createChallengeNonce(),
    chainNamespace: "solana",
    expiresAt: "2026-07-25T13:00:00.000Z",
  });
  await challenges.consumeChallenge(active.id, "2026-07-25T12:30:00.000Z");
  await assert.rejects(
    () => challenges.consumeChallenge(active.id, "2026-07-25T12:31:00.000Z"),
    ConsumedChallengeError
  );
});
