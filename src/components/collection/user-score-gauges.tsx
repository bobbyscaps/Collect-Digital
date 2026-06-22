"use client";

import { useEffect, useMemo, useState } from "react";

import { ScoreRing } from "@/components/score/score-ring";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { computeScoreSimulation } from "@/lib/scoring/engine";
import type {
  CollectionEvaluation,
  ScoreCategoryKey,
  ScoringModelVersion,
} from "@/lib/types";

const HARD_DATA_CATEGORIES: ScoreCategoryKey[] = ["market_health", "liquidity"];
const SUBJECTIVE_CATEGORIES: ScoreCategoryKey[] = [
  "community_strength",
  "builder_team",
  "product_utility",
  "culture_art_brand",
  "holder_value_rewards",
  "skin_in_the_game",
];

const CATEGORY_LABELS: Record<ScoreCategoryKey, string> = {
  market_health: "Market Health",
  liquidity: "Liquidity",
  community_strength: "Community Strength",
  builder_team: "Builder / Team",
  product_utility: "Product / Utility",
  culture_art_brand: "Culture / Art / Brand",
  holder_value_rewards: "Holder Value / Rewards",
  skin_in_the_game: "Skin in the Game",
};

function cloneVersion(version: ScoringModelVersion): ScoringModelVersion {
  return JSON.parse(JSON.stringify(version)) as ScoringModelVersion;
}

interface UserScoreGaugesProps {
  evaluation: CollectionEvaluation;
}

export function UserScoreGauges({ evaluation }: UserScoreGaugesProps) {
  const [baseVersion, setBaseVersion] = useState<ScoringModelVersion | null>(null);
  const [customVersion, setCustomVersion] = useState<ScoringModelVersion | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadModel() {
      setLoadingModel(true);
      try {
        const response = await fetch("/api/score-lab/models");
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { versions: ScoringModelVersion[] };
        if (!active || !payload.versions.length) {
          return;
        }
        const baseline =
          payload.versions.find((version) => version.isActive) ?? payload.versions[0];
        setBaseVersion(baseline);
        setCustomVersion(cloneVersion(baseline));
      } finally {
        if (active) {
          setLoadingModel(false);
        }
      }
    }

    void loadModel();
    return () => {
      active = false;
    };
  }, []);

  const simulation = useMemo(() => {
    if (!baseVersion || !customVersion) {
      return null;
    }
    return computeScoreSimulation(evaluation, baseVersion, customVersion);
  }, [evaluation, baseVersion, customVersion]);

  const totalPoints = useMemo(() => {
    if (!customVersion) {
      return 0;
    }
    return [...HARD_DATA_CATEGORIES, ...SUBJECTIVE_CATEGORIES].reduce(
      (acc, key) => acc + (customVersion.categoryWeights[key] ?? 0),
      0
    );
  }, [customVersion]);

  function updateGauge(category: ScoreCategoryKey, value: number) {
    setCustomVersion((previous) => {
      if (!previous) {
        return previous;
      }
      return {
        ...previous,
        categoryWeights: {
          ...previous.categoryWeights,
          [category]: value,
        },
      };
    });
  }

  function normalizeTo100() {
    setCustomVersion((previous) => {
      if (!previous) {
        return previous;
      }
      const keys = [...HARD_DATA_CATEGORIES, ...SUBJECTIVE_CATEGORIES];
      const total = keys.reduce(
        (acc, key) => acc + (previous.categoryWeights[key] ?? 0),
        0
      );
      if (total <= 0) {
        return previous;
      }
      const categoryWeights = { ...previous.categoryWeights };
      for (const key of keys) {
        categoryWeights[key] =
          Math.round(((categoryWeights[key] ?? 0) / total) * 1000) / 10;
      }
      return { ...previous, categoryWeights };
    });
  }

  function resetGauges() {
    if (!baseVersion) {
      return;
    }
    setCustomVersion(cloneVersion(baseVersion));
  }

  function renderGaugeGroup(
    title: string,
    description: string,
    categories: ScoreCategoryKey[]
  ) {
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {categories.map((category) => (
          <div key={category} className="space-y-1">
            <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={customVersion?.categoryWeights[category] ?? 0}
                onChange={(event) => updateGauge(category, Number(event.target.value))}
                className="w-full"
                disabled={!customVersion}
              />
              <span className="w-12 text-right text-xs text-muted-foreground">
                {(customVersion?.categoryWeights[category] ?? 0).toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadingModel ? (
        <p className="text-sm text-muted-foreground">Loading score gauges...</p>
      ) : null}
      {simulation ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ScoreRing score={simulation.baseline.overallScore} label="CD score" />
            <ScoreRing score={simulation.simulated.overallScore} label="Your score" />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Delta: {simulation.delta >= 0 ? "+" : ""}
            {simulation.delta.toFixed(1)} points
          </p>
        </>
      ) : null}

      <div className="flex items-center justify-between rounded-md border p-2 text-xs">
        <span>Total gauge points</span>
        <span className="font-semibold">{totalPoints.toFixed(1)} / 100</span>
      </div>

      {renderGaugeGroup(
        "Hard data gauges",
        "Driven by floor, bids/liquidity, holder count, and listed supply dynamics.",
        HARD_DATA_CATEGORIES
      )}
      {renderGaugeGroup(
        "Subjective gauges",
        "Express your conviction on team quality, brand strength, utility, and community.",
        SUBJECTIVE_CATEGORIES
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={normalizeTo100}>
          Normalize to 100
        </Button>
        <Button type="button" variant="ghost" onClick={resetGauges}>
          Reset gauges
        </Button>
      </div>
    </div>
  );
}
