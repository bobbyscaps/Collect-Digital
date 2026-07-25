import assert from "node:assert/strict";
import test from "node:test";

import bs58 from "bs58";
import nacl from "tweetnacl";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createInMemoryProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  ConsumedChallengeError,
  ExpiredChallengeError,
  InvalidSignatureError,
  UnsupportedNamespaceError,
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

function createService(overrides?: {
  signatureVerifier?: SignatureVerifier;
}) {
  const profileWallets = createInMemoryProfileWalletRepository();
  const challenges = createInMemoryWalletVerificationChallengeRepository();
  const service = createWalletVerificationService({
    profileWallets,
    challenges,
    signatureVerifier: overrides?.signatureVerifier,
  });
  return { profileWallets, challenges, service };
}

test("challenge repository contract exposes required methods", () => {
  const repository: WalletVerificationChallengeRepository =
    createInMemoryWalletVerificationChallengeRepository();
  assert.equal(typeof repository.createChallenge, "function");
  assert.equal(typeof repository.findActiveChallenge, "function");
  assert.equal(typeof repository.consumeChallenge, "function");
  assert.ok(createChallengeNonce().length >= 16);
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
  const { challenge, message } = await service.createChallenge({
    profileId: "profile-1",
    walletId: wallet.id,
    ttlMs: 60_000,
    now,
  });

  assert.equal(challenge.profileId, "profile-1");
  assert.equal(challenge.walletId, wallet.id);
  assert.equal(challenge.chainNamespace, "eip155");
  assert.equal(challenge.consumedAt, null);
  assert.equal(challenge.expiresAt, "2026-07-25T12:01:00.000Z");
  assert.match(challenge.nonce, /^[a-f0-9]{32}$/);
  assert.match(message, /Nonce: /);
  assert.match(message, /0xAbC123/);
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
  const { challenge } = await service.createChallenge({
    profileId: "profile-exp",
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
      service.verifyOwnership({
        profileId: "profile-exp",
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xdead",
        now: new Date("2026-07-25T12:00:02.000Z"),
      }),
    ExpiredChallengeError
  );
});

test("single-use enforcement rejects reused challenges", async () => {
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

  const { challenge } = await service.createChallenge({
    profileId: "profile-reuse",
    walletId: wallet.id,
  });

  const first = await service.verifyOwnership({
    profileId: "profile-reuse",
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
      service.verifyOwnership({
        profileId: "profile-reuse",
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xany",
      }),
    ConsumedChallengeError
  );
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

  const { challenge, message } = await service.createChallenge({
    profileId: "profile-evm",
    walletId: wallet.id,
  });
  const signature = await account.signMessage({ message });

  const verified = await service.verifyOwnership({
    profileId: "profile-evm",
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

  const { challenge, message } = await service.createChallenge({
    profileId: "profile-sol",
    walletId: wallet.id,
  });
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey)
  );

  const verified = await service.verifyOwnership({
    profileId: "profile-sol",
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

  const { challenge } = await service.createChallenge({
    profileId: "profile-bad-sig",
    walletId: wallet.id,
  });

  await assert.rejects(
    () =>
      service.verifyOwnership({
        profileId: "profile-bad-sig",
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

test("wrong wallet address raises WrongWalletError", async () => {
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

  const { challenge } = await service.createChallenge({
    profileId: "profile-wrong",
    walletId: wallet.id,
  });

  await assert.rejects(
    () =>
      service.verifyOwnership({
        profileId: "profile-wrong",
        walletId: wallet.id,
        challengeId: challenge.id,
        signature: "0xsig",
        address: "0xDifferentWallet",
      }),
    WrongWalletError
  );
});

test("unsupported namespace raises UnsupportedNamespaceError", async () => {
  const verifier = createDefaultSignatureVerifier();
  await assert.rejects(
    () =>
      verifier.verify({
        // Cast simulates untrusted runtime input reaching the verifier edge.
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
    () =>
      challenges.consumeChallenge(
        created.id,
        "2026-07-25T12:00:02.000Z"
      ),
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
