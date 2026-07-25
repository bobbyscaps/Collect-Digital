import { randomUUID } from "node:crypto";

import type {
  CreateProfileWalletInput,
  ProfileWallet,
  ProfileWalletRole,
  ProfileWalletVerificationStatus,
  WalletChainNamespace,
} from "@/lib/profile-wallets/domain";
import { normalizeWalletAddress } from "@/lib/profile-wallets/normalization";

export class ProfileWalletOwnershipConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileWalletOwnershipConflictError";
  }
}

export class ProfileWalletNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileWalletNotFoundError";
  }
}

export interface ProfileWalletRepository {
  createWallet(input: CreateProfileWalletInput): Promise<ProfileWallet>;
  findWalletById(id: string): Promise<ProfileWallet | null>;
  findWalletByChainAndAddress(
    chainNamespace: WalletChainNamespace,
    normalizedAddress: string
  ): Promise<ProfileWallet | null>;
  listWalletsByProfile(profileId: string): Promise<readonly ProfileWallet[]>;
  updateWalletRole(id: string, role: ProfileWalletRole): Promise<ProfileWallet>;
  updateWalletVerificationStatus(
    id: string,
    verificationStatus: ProfileWalletVerificationStatus
  ): Promise<ProfileWallet>;
  /**
   * Marks a wallet verified and sets verifiedAt.
   * Must preserve role (login/primary/connected) unchanged.
   */
  markWalletVerified(id: string, verifiedAt?: string): Promise<ProfileWallet>;
  markWalletDisconnected(id: string, disconnectedAt?: string): Promise<ProfileWallet>;
}

function nowIso() {
  return new Date().toISOString();
}

function freezeWallet(wallet: ProfileWallet): Readonly<ProfileWallet> {
  return Object.freeze({ ...wallet });
}

function walletKey(chainNamespace: WalletChainNamespace, normalizedAddress: string) {
  return `${chainNamespace}:${normalizedAddress}`;
}

export function createInMemoryProfileWalletRepository(): ProfileWalletRepository {
  const wallets = new Map<string, ProfileWallet>();
  const walletIdsByIdentity = new Map<string, string>();

  function getWalletOrThrow(id: string): ProfileWallet {
    const wallet = wallets.get(id);
    if (!wallet) {
      throw new ProfileWalletNotFoundError(`Profile wallet not found: ${id}`);
    }
    return wallet;
  }

  async function createWallet(
    input: CreateProfileWalletInput
  ): Promise<ProfileWallet> {
    const normalizedAddress = normalizeWalletAddress(
      input.chainNamespace,
      input.address
    );
    const identity = walletKey(input.chainNamespace, normalizedAddress);
    if (walletIdsByIdentity.has(identity)) {
      throw new ProfileWalletOwnershipConflictError(
        `Wallet identity already linked: ${identity}`
      );
    }

    const timestamp = nowIso();
    const wallet: ProfileWallet = {
      id: randomUUID(),
      profileId: input.profileId,
      chainNamespace: input.chainNamespace,
      address: input.address.trim(),
      normalizedAddress,
      role: input.role,
      verificationStatus: input.verificationStatus ?? "pending",
      verifiedAt: input.verifiedAt ?? null,
      disconnectedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    wallets.set(wallet.id, wallet);
    walletIdsByIdentity.set(identity, wallet.id);
    return freezeWallet(wallet);
  }

  async function findWalletById(id: string): Promise<ProfileWallet | null> {
    const wallet = wallets.get(id);
    return wallet ? freezeWallet(wallet) : null;
  }

  async function findWalletByChainAndAddress(
    chainNamespace: WalletChainNamespace,
    normalizedAddress: string
  ): Promise<ProfileWallet | null> {
    const id = walletIdsByIdentity.get(walletKey(chainNamespace, normalizedAddress));
    if (!id) return null;
    return freezeWallet(getWalletOrThrow(id));
  }

  async function listWalletsByProfile(profileId: string): Promise<readonly ProfileWallet[]> {
    return Object.freeze(
      Array.from(wallets.values())
        .filter((wallet) => wallet.profileId === profileId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(freezeWallet)
    );
  }

  async function updateWalletRole(
    id: string,
    role: ProfileWalletRole
  ): Promise<ProfileWallet> {
    const wallet = getWalletOrThrow(id);
    const updated: ProfileWallet = {
      ...wallet,
      role,
      updatedAt: nowIso(),
    };
    wallets.set(id, updated);
    return freezeWallet(updated);
  }

  async function updateWalletVerificationStatus(
    id: string,
    verificationStatus: ProfileWalletVerificationStatus
  ): Promise<ProfileWallet> {
    const wallet = getWalletOrThrow(id);
    const updated: ProfileWallet = {
      ...wallet,
      verificationStatus,
      verifiedAt:
        verificationStatus === "verified" ? wallet.verifiedAt ?? nowIso() : null,
      updatedAt: nowIso(),
    };
    wallets.set(id, updated);
    return freezeWallet(updated);
  }

  async function markWalletVerified(
    id: string,
    verifiedAt?: string
  ): Promise<ProfileWallet> {
    const wallet = getWalletOrThrow(id);
    const updated: ProfileWallet = {
      ...wallet,
      verificationStatus: "verified",
      verifiedAt: verifiedAt ?? nowIso(),
      // Explicitly preserve role; verification must not alter login/primary.
      role: wallet.role,
      updatedAt: nowIso(),
    };
    wallets.set(id, updated);
    return freezeWallet(updated);
  }

  async function markWalletDisconnected(
    id: string,
    disconnectedAt?: string
  ): Promise<ProfileWallet> {
    const wallet = getWalletOrThrow(id);
    const updated: ProfileWallet = {
      ...wallet,
      disconnectedAt: disconnectedAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    wallets.set(id, updated);
    return freezeWallet(updated);
  }

  return {
    createWallet,
    findWalletById,
    findWalletByChainAndAddress,
    listWalletsByProfile,
    updateWalletRole,
    updateWalletVerificationStatus,
    markWalletVerified,
    markWalletDisconnected,
  };
}
