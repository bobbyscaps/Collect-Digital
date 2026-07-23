import type { SupportedChainKey } from "@/lib/chains/registry";
import type { ProviderKey } from "@/lib/providers/capabilities";

export type ProviderResultStatus =
  | "success"
  | "empty"
  | "partial"
  | "failure"
  | "unsupported";

export type ProviderErrorCategory =
  | "network"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "upstream"
  | "validation"
  | "unsupported";

export interface ProviderError {
  category: ProviderErrorCategory;
  message: string;
  retryable: boolean;
  rateLimited: boolean;
}

export type ProviderCacheState = "hit" | "miss" | "skip" | "unknown";

export interface ProviderDiagnostics {
  rateLimited: boolean;
  paginationTruncated: boolean;
  cacheState: ProviderCacheState;
}

interface ProviderResultBase<T, TStatus extends ProviderResultStatus> {
  readonly status: TStatus;
  readonly data: Readonly<T>;
  readonly provider: ProviderKey;
  readonly chain: SupportedChainKey;
  readonly cursor?: string;
  readonly diagnostics?: Readonly<ProviderDiagnostics>;
}

export interface ProviderSuccessResult<T>
  extends ProviderResultBase<T, "success"> {
  readonly error?: undefined;
}

export interface ProviderEmptyResult<T> extends ProviderResultBase<T, "empty"> {
  readonly error?: undefined;
}

export interface ProviderPartialResult<T>
  extends ProviderResultBase<T, "partial"> {
  readonly error?: Readonly<ProviderError>;
}

export interface ProviderFailureResult<T>
  extends ProviderResultBase<T, "failure"> {
  readonly error: Readonly<ProviderError>;
}

export interface ProviderUnsupportedResult<T>
  extends ProviderResultBase<T, "unsupported"> {
  readonly error: Readonly<ProviderError>;
}

export type ProviderResult<T> =
  | ProviderSuccessResult<T>
  | ProviderEmptyResult<T>
  | ProviderPartialResult<T>
  | ProviderFailureResult<T>
  | ProviderUnsupportedResult<T>;

export function createProviderResult<T>(
  result: ProviderResult<T>
): Readonly<ProviderResult<T>> {
  return Object.freeze({
    ...result,
    diagnostics: result.diagnostics
      ? Object.freeze({ ...result.diagnostics })
      : undefined,
    error: result.error ? Object.freeze({ ...result.error }) : undefined,
  }) as Readonly<ProviderResult<T>>;
}

export function isProviderResultStatus(value: string): value is ProviderResultStatus {
  return (
    value === "success" ||
    value === "empty" ||
    value === "partial" ||
    value === "failure" ||
    value === "unsupported"
  );
}

export function isProviderFailureResult<T>(
  result: ProviderResult<T>
): result is ProviderFailureResult<T> {
  return result.status === "failure";
}

export function isProviderUnsupportedResult<T>(
  result: ProviderResult<T>
): result is ProviderUnsupportedResult<T> {
  return result.status === "unsupported";
}

export function isProviderSuccessLikeResult<T>(
  result: ProviderResult<T>
): result is
  | ProviderSuccessResult<T>
  | ProviderEmptyResult<T>
  | ProviderPartialResult<T> {
  return (
    result.status === "success" ||
    result.status === "empty" ||
    result.status === "partial"
  );
}
