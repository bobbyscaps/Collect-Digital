"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { ScoreRing } from "@/components/score/score-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeScoreSimulation } from "@/lib/scoring/engine";
import type {
  CollectionEvaluation,
  CollectionProfile,
  ScoreCategoryKey,
  ScoringModelVersion,
} from "@/lib/types";

const CATEGORY_ORDER: ScoreCategoryKey[] = [
  "market_health",
  "liquidity",
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

const SEARCH_RESULTS_LIMIT = 12;

function cloneVersion(version: ScoringModelVersion): ScoringModelVersion {
  return JSON.parse(JSON.stringify(version)) as ScoringModelVersion;
}

export function SearchRatingWorkbench() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionProfile[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<CollectionProfile | null>(null);
  const [evaluation, setEvaluation] = useState<CollectionEvaluation | null>(null);
  const [loadingEvaluation, setLoadingEvaluation] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState<ScoringModelVersion | null>(null);
  const [customVersion, setCustomVersion] = useState<ScoringModelVersion | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);

  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    async function loadModel() {
      setLoadingModel(true);
      try {
        const response = await fetch("/api/score-lab/models");
        if (!response.ok) {
          throw new Error("Unable to load score model");
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

  useEffect(() => {
    const normalized = query.trim();
    const debounce = setTimeout(async () => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoadingSearch(true);
      setSearchError(null);

      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const response = await fetch(
          `/api/collections/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Search request failed");
        }
        const payload = (await response.json()) as { collections: CollectionProfile[] };
        if (requestRef.current !== requestId) {
          return;
        }
        setResults(payload.collections.slice(0, SEARCH_RESULTS_LIMIT));
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }
        if (requestRef.current !== requestId) {
          return;
        }
        setResults([]);
        setSearchError("Search unavailable for a moment. Please try again.");
      } finally {
        if (requestRef.current === requestId) {
          setLoadingSearch(false);
        }
      }
    }, 220);

    return () => clearTimeout(debounce);
  }, [query]);

  async function selectCollection(profile: CollectionProfile) {
    setSelectedProfile(profile);
    setEvaluationError(null);
    setLoadingEvaluation(true);
    try {
      const response = await fetch(`/api/collections/${profile.slug}`);
      if (!response.ok) {
        throw new Error("Failed loading collection details");
      }
      const payload = (await response.json()) as { evaluation: CollectionEvaluation };
      setEvaluation(payload.evaluation);
    } catch {
      setEvaluation(null);
      setEvaluationError("Could not load this collection rating right now.");
    } finally {
      setLoadingEvaluation(false);
    }
  }

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

  function normalizeGaugesTo100() {
    setCustomVersion((previous) => {
      if (!previous) {
        return previous;
      }
      const total = CATEGORY_ORDER.reduce(
        (acc, key) => acc + (previous.categoryWeights[key] ?? 0),
        0
      );
      if (total <= 0) {
        return previous;
      }

      const nextWeights = { ...previous.categoryWeights };
      for (const key of CATEGORY_ORDER) {
        nextWeights[key] = Math.round(((nextWeights[key] ?? 0) / total) * 1000) / 10;
      }

      return {
        ...previous,
        categoryWeights: nextWeights,
      };
    });
  }

  function resetGauges() {
    if (!baseVersion) {
      return;
    }
    setCustomVersion(cloneVersion(baseVersion));
  }

  const totalGaugePoints = useMemo(() => {
    if (!customVersion) {
      return 0;
    }
    return CATEGORY_ORDER.reduce(
      (acc, key) => acc + (customVersion.categoryWeights[key] ?? 0),
      0
    );
  }, [customVersion]);

  const simulation = useMemo(() => {
    if (!evaluation || !baseVersion || !customVersion) {
      return null;
    }
    return computeScoreSimulation(evaluation, baseVersion, customVersion);
  }, [evaluation, baseVersion, customVersion]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Search any NFT collection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Search by collection name or slug..."
            />
          </div>
          {loadingSearch ? (
            <p className="text-sm text-muted-foreground">Searching collections...</p>
          ) : null}
          {searchError ? <p className="text-sm text-red-500">{searchError}</p> : null}
          {!loadingSearch && !searchError && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start typing to search across providers and get an instant base score.
            </p>
          ) : null}

          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((item) => (
                <button
                  type="button"
                  key={item.slug}
                  onClick={() => selectCollection(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border p-2 text-left text-sm transition hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-7 w-7 rounded-full border bg-muted" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {typeof item.baseScore === "number" ? (
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                        Base {item.baseScore}
                      </span>
                    ) : null}
                    <span className="max-w-36 truncate text-xs text-muted-foreground">
                      {item.slug}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {selectedProfile ? (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{selectedProfile.name}</p>
              <p className="text-xs text-muted-foreground">{selectedProfile.slug}</p>
              <Link
                href={`/collections/${selectedProfile.slug}`}
                className="mt-2 inline-block text-xs text-primary underline"
              >
                Open full collection page
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configure your rating gauges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingModel ? (
            <p className="text-sm text-muted-foreground">Loading scoring model...</p>
          ) : null}

          {!loadingModel && simulation ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <ScoreRing score={simulation.baseline.overallScore} label="Base rating" />
                <ScoreRing score={simulation.simulated.overallScore} label="Your rating" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Delta: {simulation.delta >= 0 ? "+" : ""}
                {simulation.delta.toFixed(1)} points
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick a collection to compare base rating vs your custom rating.
            </p>
          )}

          {loadingEvaluation ? (
            <p className="text-sm text-muted-foreground">Loading collection score...</p>
          ) : null}
          {evaluationError ? <p className="text-sm text-red-500">{evaluationError}</p> : null}

          <div className="flex items-center justify-between rounded-md border p-2 text-xs">
            <span>Total gauge points</span>
            <span className="font-semibold">{totalGaugePoints.toFixed(1)} / 100</span>
          </div>

          <div className="space-y-3">
            {CATEGORY_ORDER.map((category) => (
              <div key={category} className="space-y-1">
                <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={0.5}
                    value={customVersion?.categoryWeights[category] ?? 0}
                    onChange={(event) =>
                      updateGauge(category, Number(event.target.value))
                    }
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

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={normalizeGaugesTo100}
              disabled={!customVersion}
            >
              Normalize to 100
            </Button>
            <Button type="button" variant="ghost" onClick={resetGauges} disabled={!baseVersion}>
              Reset gauges
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
