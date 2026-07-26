import { NextResponse } from "next/server";

import { requireAuthenticatedProfile } from "@/lib/auth/require-authenticated-profile";
import type { ProfileWallet } from "@/lib/profile-wallets/domain";
import { isWalletChainNamespace } from "@/lib/profile-wallets/normalization";
import {
  toRegisteredWalletView,
  WalletRegistrationDisconnectedError,
  WalletRegistrationDuplicateError,
  WalletRegistrationError,
  WalletRegistrationOwnershipConflictError,
  WalletRegistrationRevokedError,
} from "@/lib/wallet-registration/domain";
import {
  ConsumedChallengeError,
  ExpiredChallengeError,
  InvalidSignatureError,
  ChallengeNotFoundError,
  UnsupportedNamespaceError,
  VerificationWalletNotFoundError,
  WalletProfileMismatchError,
  WalletVerificationError,
  WrongWalletError,
} from "@/lib/wallet-verification/domain";
import {
  InventorySyncFailedError,
  InventoryWalletNotFoundError,
  WalletDisconnectedError,
  WalletInventoryError,
  WalletNotVerifiedError,
  WalletPendingError,
  WalletRevokedError,
} from "@/lib/wallet-inventory/domain";
import type {
  CreateVerificationChallengeResponse,
  RegisterWalletResponse,
  SyncWalletInventoryResponse,
  VerifyWalletOwnershipResponse,
  WalletApiWallet,
  WalletInventorySyncOutcome,
  WalletVerificationFlowErrorCode,
  WalletVerificationFlowErrorResponse,
} from "@/lib/wallet-verification-flow/api-models";
import {
  createWalletVerificationFlowServices,
  type WalletVerificationFlowServices,
} from "@/lib/wallet-verification-flow/wiring";

export type WalletVerificationFlowRouteDependencies = {
  services?: WalletVerificationFlowServices;
  requireAuth?: typeof requireAuthenticatedProfile;
};

function errorResponse(
  status: number,
  code: WalletVerificationFlowErrorCode,
  message: string
) {
  const body: WalletVerificationFlowErrorResponse = {
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}

function toApiWallet(wallet: ProfileWallet): WalletApiWallet {
  return toRegisteredWalletView(wallet);
}

function mapUnknownError(cause: unknown): {
  status: number;
  code: WalletVerificationFlowErrorCode;
  message: string;
} {
  if (cause instanceof WalletRegistrationOwnershipConflictError) {
    return { status: 409, code: "wallet_ownership_conflict", message: cause.message };
  }
  if (cause instanceof WalletRegistrationRevokedError) {
    return { status: 409, code: "wallet_revoked", message: cause.message };
  }
  if (cause instanceof WalletRegistrationDisconnectedError) {
    return { status: 409, code: "wallet_disconnected", message: cause.message };
  }
  if (cause instanceof WalletRegistrationDuplicateError) {
    return { status: 409, code: "duplicate_registration", message: cause.message };
  }
  if (cause instanceof WalletRegistrationError) {
    const status =
      cause.code === "unsupported_namespace" || cause.code === "invalid_address"
        ? 400
        : 409;
    return { status, code: cause.code, message: cause.message };
  }

  if (cause instanceof InvalidSignatureError) {
    return { status: 400, code: "invalid_signature", message: cause.message };
  }
  if (cause instanceof ExpiredChallengeError) {
    return { status: 400, code: "expired_challenge", message: cause.message };
  }
  if (cause instanceof ConsumedChallengeError) {
    return { status: 400, code: "consumed_challenge", message: cause.message };
  }
  if (cause instanceof ChallengeNotFoundError) {
    return { status: 404, code: "challenge_not_found", message: cause.message };
  }
  if (cause instanceof WrongWalletError) {
    return { status: 400, code: "wrong_wallet", message: cause.message };
  }
  if (cause instanceof UnsupportedNamespaceError) {
    return { status: 400, code: "unsupported_namespace", message: cause.message };
  }
  if (cause instanceof VerificationWalletNotFoundError) {
    return { status: 404, code: "wallet_not_found", message: cause.message };
  }
  if (cause instanceof WalletProfileMismatchError) {
    return { status: 403, code: "wallet_profile_mismatch", message: cause.message };
  }
  if (cause instanceof WalletVerificationError) {
    return { status: 400, code: cause.code, message: cause.message };
  }

  if (cause instanceof WalletNotVerifiedError) {
    return { status: 400, code: "wallet_not_verified", message: cause.message };
  }
  if (cause instanceof WalletPendingError) {
    return { status: 400, code: "wallet_pending", message: cause.message };
  }
  if (cause instanceof WalletRevokedError) {
    return { status: 409, code: "wallet_revoked", message: cause.message };
  }
  if (cause instanceof WalletDisconnectedError) {
    return { status: 409, code: "wallet_disconnected", message: cause.message };
  }
  if (cause instanceof InventoryWalletNotFoundError) {
    return { status: 404, code: "wallet_not_found", message: cause.message };
  }
  if (cause instanceof InventorySyncFailedError) {
    return { status: 502, code: "sync_failed", message: cause.message };
  }
  if (cause instanceof WalletInventoryError) {
    return { status: 400, code: cause.code === "sync_failed" ? "sync_failed" : "invalid_request", message: cause.message };
  }

  const technical =
    cause instanceof Error ? cause.message : "Wallet verification request failed.";
  if (
    technical.includes("Supabase admin client unavailable") ||
    technical.includes("SUPABASE") ||
    technical.toLowerCase().includes("repository")
  ) {
    console.error("[collect-digital] wallet-verification infrastructure:", technical);
    return {
      status: 503,
      code: "service_unavailable",
      message:
        "Wallet verification is temporarily unavailable. Please try again shortly.",
    };
  }

  // Never leak stack traces or infrastructure names to clients.
  console.error("[collect-digital] wallet-verification unexpected:", technical);
  return {
    status: 500,
    code: "internal_error",
    message: "Something went wrong. Please try again shortly.",
  };
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function resolveServices(
  dependencies: WalletVerificationFlowRouteDependencies
): WalletVerificationFlowServices {
  return dependencies.services ?? createWalletVerificationFlowServices();
}

async function runInventorySync(
  services: WalletVerificationFlowServices,
  walletId: string
): Promise<WalletInventorySyncOutcome> {
  try {
    const result = await services.inventory.syncVerifiedWalletInventory({
      walletId,
    });
    return {
      status: "success",
      syncId: result.sync.id,
      errorMessage: null,
      writtenCount: result.writtenCount,
      removedCount: result.removedCount,
      previousInventoryPreserved: false,
    };
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Wallet inventory synchronization failed.";
    // Verification and inventory sync are separate outcomes.
    // Do not roll back ownership verification on sync failure.
    return {
      status: "failure",
      syncId: null,
      errorMessage: message,
      writtenCount: null,
      removedCount: null,
      previousInventoryPreserved: true,
    };
  }
}

/**
 * POST /api/wallets/register
 *
 * Registers the authenticated user's connected wallet. Does not mark verified.
 */
export async function handleRegisterWallet(
  request: Request,
  dependencies: WalletVerificationFlowRouteDependencies = {}
) {
  const requireAuth = dependencies.requireAuth ?? requireAuthenticatedProfile;
  const authResult = await requireAuth(request);
  if (!authResult.ok) {
    return errorResponse(authResult.status, authResult.code, authResult.message);
  }

  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const { address, chainNamespace, role } = body as {
    address?: unknown;
    chainNamespace?: unknown;
    role?: unknown;
  };

  if (typeof address !== "string" || !address.trim()) {
    return errorResponse(400, "invalid_address", "Wallet address is required.");
  }
  if (typeof chainNamespace !== "string" || !isWalletChainNamespace(chainNamespace)) {
    return errorResponse(
      400,
      "unsupported_namespace",
      "chainNamespace must be eip155 or solana."
    );
  }
  if (
    role !== undefined &&
    role !== "login" &&
    role !== "primary" &&
    role !== "connected"
  ) {
    return errorResponse(400, "invalid_request", "Invalid wallet role.");
  }

  try {
    const services = resolveServices(dependencies);
    const result = await services.registration.registerWallet(authResult.auth, {
      address,
      chainNamespace,
      role,
    });
    const response: RegisterWalletResponse = {
      wallet: toApiWallet(result.wallet),
      created: result.created,
    };
    return NextResponse.json(response, { status: result.created ? 201 : 200 });
  } catch (cause) {
    const mapped = mapUnknownError(cause);
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}

/**
 * POST /api/wallets/verification/challenge
 *
 * Creates a short-lived, single-use ownership challenge with a canonical message.
 */
export async function handleCreateVerificationChallenge(
  request: Request,
  dependencies: WalletVerificationFlowRouteDependencies = {}
) {
  const requireAuth = dependencies.requireAuth ?? requireAuthenticatedProfile;
  const authResult = await requireAuth(request);
  if (!authResult.ok) {
    return errorResponse(authResult.status, authResult.code, authResult.message);
  }

  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const { walletId } = body as { walletId?: unknown };
  if (typeof walletId !== "string" || !walletId.trim()) {
    return errorResponse(400, "invalid_request", "walletId is required.");
  }

  try {
    const services = resolveServices(dependencies);
    const { challenge, message } = await services.verification.createChallenge(
      authResult.auth,
      { walletId: walletId.trim() }
    );

    const wallet = await services.profileWallets.findWalletById(challenge.walletId);
    if (!wallet) {
      return errorResponse(404, "wallet_not_found", "Challenge wallet not found.");
    }

    const response: CreateVerificationChallengeResponse = {
      challengeId: challenge.id,
      walletId: challenge.walletId,
      chainNamespace: challenge.chainNamespace,
      normalizedAddress: wallet.normalizedAddress,
      expiresAt: challenge.expiresAt,
      message,
    };
    return NextResponse.json(response);
  } catch (cause) {
    const mapped = mapUnknownError(cause);
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}

/**
 * POST /api/wallets/verification/verify
 *
 * Verifies a wallet ownership signature (PR4). Inventory sync is a separate
 * outcome triggered by POST /api/wallets/inventory/sync so the client can show
 * truthful progress without rolling verification back on sync failure.
 */
export async function handleVerifyWalletOwnership(
  request: Request,
  dependencies: WalletVerificationFlowRouteDependencies = {}
) {
  const requireAuth = dependencies.requireAuth ?? requireAuthenticatedProfile;
  const authResult = await requireAuth(request);
  if (!authResult.ok) {
    return errorResponse(authResult.status, authResult.code, authResult.message);
  }

  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const { walletId, challengeId, signature, address } = body as {
    walletId?: unknown;
    challengeId?: unknown;
    signature?: unknown;
    address?: unknown;
  };

  if (typeof walletId !== "string" || !walletId.trim()) {
    return errorResponse(400, "invalid_request", "walletId is required.");
  }
  if (typeof challengeId !== "string" || !challengeId.trim()) {
    return errorResponse(400, "invalid_request", "challengeId is required.");
  }
  if (typeof signature !== "string" || !signature.trim()) {
    return errorResponse(400, "invalid_request", "signature is required.");
  }
  if (address !== undefined && typeof address !== "string") {
    return errorResponse(400, "invalid_request", "address must be a string when provided.");
  }

  try {
    const services = resolveServices(dependencies);
    const verified = await services.verification.verifyOwnership(authResult.auth, {
      walletId: walletId.trim(),
      challengeId: challengeId.trim(),
      signature: signature.trim(),
      address: typeof address === "string" ? address : undefined,
    });

    const response: VerifyWalletOwnershipResponse = {
      wallet: toApiWallet(verified),
      inventorySync: {
        status: "skipped",
        syncId: null,
        errorMessage: null,
        writtenCount: null,
        removedCount: null,
        previousInventoryPreserved: true,
      },
    };
    return NextResponse.json(response);
  } catch (cause) {
    const mapped = mapUnknownError(cause);
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}

/**
 * POST /api/wallets/inventory/sync
 *
 * Retries inventory synchronization for an already-verified wallet.
 * Does not alter verification status.
 */
export async function handleSyncWalletInventory(
  request: Request,
  dependencies: WalletVerificationFlowRouteDependencies = {}
) {
  const requireAuth = dependencies.requireAuth ?? requireAuthenticatedProfile;
  const authResult = await requireAuth(request);
  if (!authResult.ok) {
    return errorResponse(authResult.status, authResult.code, authResult.message);
  }

  const body = await parseJsonBody(request);
  if (!body || typeof body !== "object") {
    return errorResponse(400, "invalid_request", "Request body must be JSON.");
  }

  const { walletId } = body as { walletId?: unknown };
  if (typeof walletId !== "string" || !walletId.trim()) {
    return errorResponse(400, "invalid_request", "walletId is required.");
  }

  try {
    const services = resolveServices(dependencies);
    const wallet = await services.profileWallets.findWalletById(walletId.trim());
    if (!wallet) {
      return errorResponse(404, "wallet_not_found", "Profile wallet not found.");
    }
    if (wallet.profileId !== authResult.auth.profileId) {
      return errorResponse(
        403,
        "wallet_profile_mismatch",
        "Wallet does not belong to the authenticated profile."
      );
    }

    const inventorySync = await runInventorySync(services, wallet.id);
    if (inventorySync.status === "failure") {
      // Explicit sync-failure status for retry UI; wallet remains verified.
      const response: SyncWalletInventoryResponse = {
        wallet: toApiWallet(wallet),
        inventorySync,
      };
      return NextResponse.json(response, { status: 200 });
    }

    const refreshed =
      (await services.profileWallets.findWalletById(wallet.id)) ?? wallet;
    const response: SyncWalletInventoryResponse = {
      wallet: toApiWallet(refreshed),
      inventorySync,
    };
    return NextResponse.json(response);
  } catch (cause) {
    const mapped = mapUnknownError(cause);
    return errorResponse(mapped.status, mapped.code, mapped.message);
  }
}
