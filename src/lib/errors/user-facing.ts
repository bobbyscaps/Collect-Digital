/**
 * Maps internal/infrastructure errors to safe user-facing copy.
 * Technical detail must be logged server-side — never shown to end users.
 */

export const USER_FACING_SERVICE_UNAVAILABLE =
  "Wallet verification is temporarily unavailable. Please try again shortly.";

export const USER_FACING_IDENTITY_UNAVAILABLE =
  "Your Collector Identity is temporarily unavailable. Please try again shortly.";

export const USER_FACING_INTERNAL_ERROR =
  "Something went wrong. Please try again shortly.";

export function isInfrastructureErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("supabase admin client unavailable") ||
    lower.includes("supabase") ||
    lower.includes("service role") ||
    lower.includes("repository") ||
    lower.includes("profilewallet") ||
    lower.includes("walletinventory") ||
    lower.includes("walletverification") ||
    lower.includes("env.") ||
    lower.includes("process.env") ||
    lower.includes("stack") ||
    lower.includes("    at ")
  );
}

/**
 * Returns copy safe for API clients / UI. Logs the original technical detail.
 */
export function toUserFacingErrorMessage(
  cause: unknown,
  fallback: string = USER_FACING_INTERNAL_ERROR
): string {
  const technical =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : fallback;

  if (
    isInfrastructureErrorMessage(technical) ||
    technical.includes("SUPABASE")
  ) {
    console.error("[collect-digital] infrastructure error:", technical);
    return USER_FACING_SERVICE_UNAVAILABLE;
  }

  // Domain errors are already safe product language.
  return technical || fallback;
}

export function logTechnicalError(context: string, cause: unknown): void {
  const technical =
    cause instanceof Error
      ? cause.stack ?? cause.message
      : typeof cause === "string"
        ? cause
        : String(cause);
  console.error(`[collect-digital] ${context}:`, technical);
}
