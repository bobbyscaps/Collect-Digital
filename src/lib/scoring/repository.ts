import { DEFAULT_SCORING_VERSION, MOCK_SCORING_VERSIONS } from "@/lib/mock-data";
import type { ScoringModelVersion } from "@/lib/types";

/**
 * Scoring version store.
 *
 * There is no database wired up yet, so these read from the built-in mock
 * scoring versions. The async signatures are kept intentionally so a real
 * persistence layer (e.g. Supabase) can be dropped in later without touching
 * callers or the Score Lab UI. Saving/activating new versions is not yet
 * supported — the Score Lab currently simulates candidate formulas in memory.
 */
export async function getActiveScoringModelVersion(): Promise<ScoringModelVersion> {
  return DEFAULT_SCORING_VERSION;
}

export async function listScoringVersions(): Promise<ScoringModelVersion[]> {
  return MOCK_SCORING_VERSIONS;
}
