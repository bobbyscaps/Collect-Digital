import type {
  CreateVerificationChallengeResponse,
  RegisterWalletResponse,
  SyncWalletInventoryResponse,
  VerifyWalletOwnershipResponse,
  WalletVerificationFlowApiError,
  WalletVerificationFlowErrorCode,
  WalletVerificationFlowErrorResponse,
} from "@/lib/wallet-verification-flow/api-models";

/**
 * Typed frontend client for PR9 wallet registration / verification / sync.
 * Uses centralized fetch logic only — no repository or domain service imports.
 */

export class WalletVerificationFlowClientError extends Error {
  readonly status: number;
  readonly code: WalletVerificationFlowErrorCode | "network_error" | "invalid_response";
  readonly details: WalletVerificationFlowApiError | null;

  constructor(
    message: string,
    input: {
      status: number;
      code: WalletVerificationFlowClientError["code"];
      details?: WalletVerificationFlowApiError | null;
    }
  ) {
    super(message);
    this.name = "WalletVerificationFlowClientError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details ?? null;
  }
}

type ClientOptions = {
  accessToken: string;
  fetchImpl?: typeof fetch;
};

async function parseError(
  response: Response
): Promise<WalletVerificationFlowApiError | null> {
  try {
    const body = (await response.json()) as WalletVerificationFlowErrorResponse;
    if (
      body?.error &&
      typeof body.error.code === "string" &&
      typeof body.error.message === "string"
    ) {
      return body.error;
    }
  } catch {
    // ignore
  }
  return null;
}

async function postJson<T>(
  endpoint: string,
  options: ClientOptions & { body: unknown },
  validate: (value: unknown) => value is T
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.body),
      cache: "no-store",
    });
  } catch (cause) {
    throw new WalletVerificationFlowClientError(
      cause instanceof Error ? cause.message : "Network request failed.",
      { status: 0, code: "network_error" }
    );
  }

  if (!response.ok) {
    const details = await parseError(response);
    throw new WalletVerificationFlowClientError(
      details?.message ?? `Wallet request failed (${response.status}).`,
      {
        status: response.status,
        code: details?.code ?? "invalid_response",
        details,
      }
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WalletVerificationFlowClientError(
      "Wallet response was not valid JSON.",
      { status: response.status, code: "invalid_response" }
    );
  }

  if (!validate(body)) {
    throw new WalletVerificationFlowClientError(
      "Wallet response failed type validation.",
      { status: response.status, code: "invalid_response" }
    );
  }

  return body;
}

function isWalletShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const wallet = value as Record<string, unknown>;
  return (
    typeof wallet.walletId === "string" &&
    (wallet.chainNamespace === "eip155" || wallet.chainNamespace === "solana") &&
    typeof wallet.address === "string" &&
    typeof wallet.normalizedAddress === "string" &&
    typeof wallet.role === "string" &&
    typeof wallet.verificationStatus === "string"
  );
}

function isRegisterResponse(value: unknown): value is RegisterWalletResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<RegisterWalletResponse>;
  return isWalletShape(body.wallet) && typeof body.created === "boolean";
}

function isChallengeResponse(
  value: unknown
): value is CreateVerificationChallengeResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CreateVerificationChallengeResponse>;
  return (
    typeof body.challengeId === "string" &&
    typeof body.walletId === "string" &&
    typeof body.message === "string" &&
    typeof body.expiresAt === "string" &&
    typeof body.normalizedAddress === "string" &&
    (body.chainNamespace === "eip155" || body.chainNamespace === "solana")
  );
}

function isSyncOutcome(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const sync = value as Record<string, unknown>;
  return (
    (sync.status === "success" ||
      sync.status === "failure" ||
      sync.status === "skipped") &&
    typeof sync.previousInventoryPreserved === "boolean"
  );
}

function isVerifyResponse(value: unknown): value is VerifyWalletOwnershipResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<VerifyWalletOwnershipResponse>;
  return isWalletShape(body.wallet) && isSyncOutcome(body.inventorySync);
}

function isSyncResponse(value: unknown): value is SyncWalletInventoryResponse {
  return isVerifyResponse(value);
}

export async function registerWallet(options: ClientOptions & {
  address: string;
  chainNamespace: "eip155" | "solana";
  role?: "login" | "primary" | "connected";
  endpoint?: string;
}): Promise<RegisterWalletResponse> {
  return postJson(
    options.endpoint ?? "/api/wallets/register",
    {
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
      body: {
        address: options.address,
        chainNamespace: options.chainNamespace,
        role: options.role,
      },
    },
    isRegisterResponse
  );
}

export async function createWalletVerificationChallenge(options: ClientOptions & {
  walletId: string;
  endpoint?: string;
}): Promise<CreateVerificationChallengeResponse> {
  return postJson(
    options.endpoint ?? "/api/wallets/verification/challenge",
    {
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
      body: { walletId: options.walletId },
    },
    isChallengeResponse
  );
}

export async function verifyWalletOwnership(options: ClientOptions & {
  walletId: string;
  challengeId: string;
  signature: string;
  address?: string;
  endpoint?: string;
}): Promise<VerifyWalletOwnershipResponse> {
  return postJson(
    options.endpoint ?? "/api/wallets/verification/verify",
    {
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
      body: {
        walletId: options.walletId,
        challengeId: options.challengeId,
        signature: options.signature,
        address: options.address,
      },
    },
    isVerifyResponse
  );
}

export async function syncVerifiedWalletInventory(options: ClientOptions & {
  walletId: string;
  endpoint?: string;
}): Promise<SyncWalletInventoryResponse> {
  return postJson(
    options.endpoint ?? "/api/wallets/inventory/sync",
    {
      accessToken: options.accessToken,
      fetchImpl: options.fetchImpl,
      body: { walletId: options.walletId },
    },
    isSyncResponse
  );
}
