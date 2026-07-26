/**
 * Truthful UI phases for the Verify Wallet flow.
 * Do not invent progress percentages or scoring language.
 */

export type WalletVerificationUiPhase =
  | "ready"
  | "registering"
  | "awaiting_signature"
  | "verifying"
  | "verified"
  | "synchronizing"
  | "complete"
  | "cancelled"
  | "verification_failed"
  | "sync_failed";

export type VerificationProgressStage =
  | "wallet_connected"
  | "ownership_verified"
  | "collectibles_synchronized"
  | "collector_identity_updated";

export const PHASE_LABELS: Record<WalletVerificationUiPhase, string> = {
  ready: "Verify Wallet",
  registering: "Preparing your wallet...",
  awaiting_signature: "Sign the message in your wallet",
  verifying: "Verifying wallet ownership...",
  verified: "Wallet verified",
  synchronizing: "Synchronizing your collectibles...",
  complete: "Your Collector Identity is ready",
  cancelled: "Wallet verification was cancelled.",
  verification_failed: "Verification Failed",
  sync_failed:
    "Your wallet is verified, but inventory synchronization failed.",
};

export const OWNERSHIP_REASSURANCE =
  "This proves ownership of your wallet. It does not initiate a transaction or grant spending permission.";

export const PROGRESS_STAGE_LABELS: Record<VerificationProgressStage, string> = {
  wallet_connected: "Wallet connected",
  ownership_verified: "Wallet ownership verified",
  collectibles_synchronized: "Collectibles synchronized",
  collector_identity_updated: "Collector Identity updated",
};

export function stagesForPhase(
  phase: WalletVerificationUiPhase
): VerificationProgressStage[] {
  switch (phase) {
    case "ready":
    case "registering":
    case "awaiting_signature":
    case "verifying":
    case "cancelled":
    case "verification_failed":
      return ["wallet_connected"];
    case "verified":
    case "synchronizing":
    case "sync_failed":
      return ["wallet_connected", "ownership_verified"];
    case "complete":
      return [
        "wallet_connected",
        "ownership_verified",
        "collectibles_synchronized",
        "collector_identity_updated",
      ];
    default:
      return ["wallet_connected"];
  }
}

/** Client-side signing errors that must not crash the profile. */
export type ClientSigningErrorCode =
  | "user_cancelled"
  | "unsupported_capability"
  | "signing_failed";

export class ClientSigningError extends Error {
  readonly code: ClientSigningErrorCode;

  constructor(code: ClientSigningErrorCode, message: string) {
    super(message);
    this.name = "ClientSigningError";
    this.code = code;
  }
}

export function isUserCancellationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  return (
    name.includes("reject") ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("request rejected")
  );
}
