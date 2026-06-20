import { DEFAULT_SCORING_VERSION, MOCK_SCORING_VERSIONS } from "@/lib/mock-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ScoringModelVersion } from "@/lib/types";

function normalizeDbVersion(
  version: {
    id: string;
    model_id: string;
    model_name: string;
    version_name: string;
    is_active: boolean;
    description: string | null;
    created_at: string;
    category_weights: Record<string, number>;
  },
  factorRules: {
    key: string;
    label: string;
    category: string;
    enabled: boolean;
    weight: number;
    source_metric: string;
    normalization: string;
    min_value: number | null;
    max_value: number | null;
    cap: number | null;
  }[]
): ScoringModelVersion {
  return {
    id: version.id,
    modelId: version.model_id,
    modelName: version.model_name,
    versionName: version.version_name,
    isActive: version.is_active,
    description: version.description,
    createdAt: version.created_at,
    categoryWeights: version.category_weights as ScoringModelVersion["categoryWeights"],
    factorRules: factorRules.map((factor) => ({
      key: factor.key,
      label: factor.label,
      category: factor.category as ScoringModelVersion["factorRules"][number]["category"],
      enabled: factor.enabled,
      weight: factor.weight,
      sourceMetric: factor.source_metric,
      normalization: factor.normalization as ScoringModelVersion["factorRules"][number]["normalization"],
      minValue: factor.min_value ?? undefined,
      maxValue: factor.max_value ?? undefined,
      cap: factor.cap ?? undefined,
    })),
  };
}

export async function getActiveScoringModelVersion(): Promise<ScoringModelVersion> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return DEFAULT_SCORING_VERSION;
  }

  const { data: version, error } = await supabase
    .from("scoring_versions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !version) {
    return DEFAULT_SCORING_VERSION;
  }

  const { data: factors, error: factorsError } = await supabase
    .from("scoring_factor_rules")
    .select("*")
    .eq("scoring_version_id", version.id)
    .order("created_at", { ascending: true });

  if (factorsError || !factors) {
    return DEFAULT_SCORING_VERSION;
  }

  return normalizeDbVersion(version, factors);
}

export async function listScoringVersions(): Promise<ScoringModelVersion[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return MOCK_SCORING_VERSIONS;
  }

  const { data: versions, error } = await supabase
    .from("scoring_versions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !versions?.length) {
    return MOCK_SCORING_VERSIONS;
  }

  const { data: factors } = await supabase.from("scoring_factor_rules").select("*");
  const grouped = new Map<string, typeof factors>();
  for (const factor of factors ?? []) {
    const collection = grouped.get(factor.scoring_version_id) ?? [];
    collection.push(factor);
    grouped.set(factor.scoring_version_id, collection);
  }

  return versions.map((version) =>
    normalizeDbVersion(version, grouped.get(version.id) ?? [])
  );
}
