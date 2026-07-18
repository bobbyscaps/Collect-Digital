"use client";

import { useEffect, useMemo, useState } from "react";

import { ScoreFormulaEditor } from "@/components/admin/score-formula-editor";
import { ScoreSimulatorPanel } from "@/components/admin/score-simulator-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScoreSimulationResult, ScoringModelVersion } from "@/lib/types";

interface ScoreLabWorkbenchProps {
  versions: ScoringModelVersion[];
}

export function ScoreLabWorkbench({ versions }: ScoreLabWorkbenchProps) {
  const [selectedVersionId, setSelectedVersionId] = useState(
    versions[0]?.id ?? "default"
  );
  const [simulation, setSimulation] = useState<ScoreSimulationResult | null>(null);
  const [backtest, setBacktest] = useState<
    { versionName: string; averageScore: number; modeledLongTermFit: number }[]
  >([]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0],
    [selectedVersionId, versions]
  );

  async function onSimulate(candidateVersion: ScoringModelVersion) {
    const response = await fetch("/api/score-lab/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseVersionId: selectedVersion.id,
        candidateVersion,
        collectionSlug: "azuki",
      }),
    });
    const data = (await response.json()) as ScoreSimulationResult;
    setSimulation(data);
  }

  useEffect(() => {
    async function loadBacktest() {
      const response = await fetch("/api/score-lab/backtest");
      const data = (await response.json()) as {
        results: { versionName: string; averageScore: number; modeledLongTermFit: number }[];
      };
      setBacktest(data.results);
    }
    void loadBacktest();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Formula versioning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => setSelectedVersionId(version.id)}
                className="rounded-md border px-3 py-1 text-sm transition hover:bg-accent"
              >
                {version.versionName}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Backtesting ready</Badge>
            <Badge variant="outline">Rollback supported</Badge>
            <Badge variant="outline">Configurable weights</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ScoreFormulaEditor version={selectedVersion} onSimulate={onSimulate} />
        <ScoreSimulatorPanel simulation={simulation} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backtesting mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {backtest.map((row) => (
            <div key={row.versionName} className="rounded-md border p-3">
              <p className="font-medium">{row.versionName}</p>
              <p className="text-muted-foreground">
                Avg score {row.averageScore} · Modeled long-term fit {row.modeledLongTermFit}%
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
