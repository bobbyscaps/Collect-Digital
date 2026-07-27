import type {
  CollectorIdentityApiError,
  CollectorIdentityErrorResponse,
  CollectorIdentityResponse,
} from "@/lib/collector-identity/api-models";

/**
 * Typed frontend client for Collector Identity.
 * Uses centralized fetch logic only — no repository or domain service imports.
 */

export class CollectorIdentityClientError extends Error {
  readonly status: number;
  readonly code: CollectorIdentityApiError["code"] | "network_error" | "invalid_response";
  readonly details: CollectorIdentityApiError | null;

  constructor(
    message: string,
    input: {
      status: number;
      code: CollectorIdentityClientError["code"];
      details?: CollectorIdentityApiError | null;
    }
  ) {
    super(message);
    this.name = "CollectorIdentityClientError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details ?? null;
  }
}

export type FetchCollectorIdentityOptions = {
  /** Privy access token (Bearer). Required. */
  accessToken: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
  /** Optional absolute/relative endpoint override. */
  endpoint?: string;
};

function isCollectorIdentityResponse(
  value: unknown
): value is CollectorIdentityResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CollectorIdentityResponse>;
  return (
    body.schemaVersion === 1 &&
    typeof body.profileId === "string" &&
    !!body.identity &&
    !!body.wallets &&
    !!body.inventory &&
    !!body.collectionSummaries &&
    !!body.assets &&
    !!body.statusModules &&
    !!body.achievements
  );
}

async function parseError(
  response: Response
): Promise<CollectorIdentityApiError | null> {
  try {
    const body = (await response.json()) as CollectorIdentityErrorResponse;
    if (
      body?.error &&
      typeof body.error.code === "string" &&
      typeof body.error.message === "string"
    ) {
      return body.error;
    }
  } catch {
    // ignore parse failures
  }
  return null;
}

/**
 * GET /api/collector-identity/me — authenticated Collector Identity.
 */
export async function fetchMyCollectorIdentity(
  options: FetchCollectorIdentityOptions
): Promise<CollectorIdentityResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "/api/collector-identity/me";

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (cause) {
    throw new CollectorIdentityClientError(
      cause instanceof Error ? cause.message : "Network request failed.",
      { status: 0, code: "network_error" }
    );
  }

  if (!response.ok) {
    const details = await parseError(response);
    throw new CollectorIdentityClientError(
      details?.message ?? `Collector Identity request failed (${response.status}).`,
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
    throw new CollectorIdentityClientError(
      "Collector Identity response was not valid JSON.",
      { status: response.status, code: "invalid_response" }
    );
  }

  if (!isCollectorIdentityResponse(body)) {
    throw new CollectorIdentityClientError(
      "Collector Identity response failed type validation.",
      { status: response.status, code: "invalid_response" }
    );
  }

  return body;
}
