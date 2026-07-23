import type {
  SupportedChainId,
  SupportedChainKey,
} from "@/lib/chains/registry";
import type {
  ProviderDiagnostics,
  ProviderError,
  ProviderResult,
} from "@/lib/providers/results";
import type {
  NormalizedHeldToken,
  NormalizedWalletActivity,
} from "@/providers/types";
import type {
  WalletBehaviorMetrics,
  WalletCollectorRating,
} from "@/lib/types";

export type WalletPerChainStatus =
  | "ok"
  | "empty"
  | "partial"
  | "failure"
  | "unsupported";

export type WalletDataCoverage = "none" | "partial" | "complete";

export interface WalletPerChainCoverage {
  holdings: WalletDataCoverage;
  activity: WalletDataCoverage;
}

export interface WalletPerChainRawData {
  holdings: readonly NormalizedHeldToken[];
  activity: readonly NormalizedWalletActivity[];
}

export interface WalletPerChainResult {
  chain: SupportedChainKey;
  chainId?: SupportedChainId;
  status: WalletPerChainStatus;
  raw: WalletPerChainRawData;
  derivedMetrics?: WalletBehaviorMetrics | null;
  providerAttempts: readonly ProviderResult<unknown>[];
  coverage?: WalletPerChainCoverage;
  diagnostics?: Readonly<ProviderDiagnostics>;
}

export type WalletMetricsDerivationStatus =
  | "ok"
  | "empty_wallet"
  | "partial"
  | "provider_failure"
  | "unsupported_chain"
  | "invalid_address";

export interface WalletMetricsDerivationDiagnostics {
  hasProviderFailures: boolean;
  chainsRequested: number;
  chainsReported: number;
  partialChains: number;
}

export interface WalletMetricsDerivationResult {
  status: WalletMetricsDerivationStatus;
  overallMetrics: WalletBehaviorMetrics | null;
  perChain: readonly WalletPerChainResult[];
  diagnostics?: Readonly<WalletMetricsDerivationDiagnostics>;
  failures?: readonly Readonly<ProviderError>[];
}

export interface WalletCollectorRatingApiContract {
  status: WalletMetricsDerivationStatus;
  rating: WalletCollectorRating | null;
  overallMetrics: WalletBehaviorMetrics | null;
  perChain: readonly WalletPerChainResult[];
  diagnostics?: Readonly<WalletMetricsDerivationDiagnostics>;
}

export function isWalletMetricsDerivationStatus(
  value: string
): value is WalletMetricsDerivationStatus {
  return (
    value === "ok" ||
    value === "empty_wallet" ||
    value === "partial" ||
    value === "provider_failure" ||
    value === "unsupported_chain" ||
    value === "invalid_address"
  );
}

export function createWalletMetricsDerivationResult(
  result: WalletMetricsDerivationResult
): Readonly<WalletMetricsDerivationResult> {
  return Object.freeze({
    ...result,
    perChain: Object.freeze(
      result.perChain.map((chainResult) =>
        Object.freeze({
          ...chainResult,
          raw: Object.freeze({
            holdings: Object.freeze([...chainResult.raw.holdings]),
            activity: Object.freeze([...chainResult.raw.activity]),
          }),
          providerAttempts: Object.freeze([...chainResult.providerAttempts]),
          coverage: chainResult.coverage
            ? Object.freeze({ ...chainResult.coverage })
            : undefined,
          diagnostics: chainResult.diagnostics
            ? Object.freeze({ ...chainResult.diagnostics })
            : undefined,
        })
      )
    ),
    diagnostics: result.diagnostics
      ? Object.freeze({ ...result.diagnostics })
      : undefined,
    failures: result.failures
      ? Object.freeze(result.failures.map((failure) => Object.freeze({ ...failure })))
      : undefined,
  });
}

export function isWalletMetricsDerivationRequestValid(
  status: WalletMetricsDerivationStatus
): boolean {
  return status !== "invalid_address";
}

export function hasWalletMetricsDerivationSuccessfulData(
  status: WalletMetricsDerivationStatus
): boolean {
  return status === "ok" || status === "partial";
}

export function isWalletMetricsDerivationRecoverableProviderFailure(
  status: WalletMetricsDerivationStatus
): boolean {
  return status === "provider_failure";
}
