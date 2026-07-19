"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

import { ScoreFormulaEditor } from "@/components/admin/score-formula-editor";
import { ScoreSimulatorPanel } from "@/components/admin/score-simulator-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScoreSimulationResult, ScoringModelVersion } from "@/lib/types";

interface ScoreLabWorkbenchProps {
  versions: ScoringModelVersion[];
}

export function ScoreLabWorkbench({ versions: initialVersions }: ScoreLabWorkbenchProps) {
  const { getAccessToken } = usePrivy();
  const [versions, setVersions] = useState<ScoringModelVersion[]>(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = useState(
    initialVersions.find((v) => v.isActive)?.id ?? initialVersions[0]?.id ?? "default"
  );
  const [simulation, setSimulation] = useState<ScoreSimulationResult | null>(null);
  const [backtest, setBacktest] = useState<
    { versionName: string; averageScore: number; modeledLongTermFit: number }[]
  >([]);
  const [status, setStatus] = useState<string | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0],
    [selectedVersionId, versions]
  );

  const authFetch = useCallback(
    async (url: string, body: unknown) => {
      const token = await getAccessToken().catch(() => null);
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    },
    [getAccessToken]
  );

  const reloadVersions = useCallback(async () => {
    const response = await fetch("/api/score-lab/models");
    const data = (await response.json()) as { versions: ScoringModelVersion[] };
    setVersions(data.versions);
    return data.versions;
  }, []);

  async function onSimulate(candidateVersion: ScoringModelVersion) {
    const response = await authFetch("/api/score-lab/simulate", {
      baseVersionId: selectedVersion.id,
      candidateVersion,
      collectionSlug: "azuki",
    });
    const data = (await response.json()) as ScoreSimulationResult;
    setSimulation(data);
  }

  async function onSaveNew(candidateVersion: ScoringModelVersion, name: string) {
    setStatus(null);
    const response = await authFetch("/api/score-lab/versions", {
      ...candidateVersion,
      id: "",
      versionName: name,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(data.error ?? "Failed to save version.");
      return;
    }
    const data = (await response.json()) as { version: ScoringModelVersion };
    await reloadVersions();
    setSelectedVersionId(data.version.id);
    setStatus(`Saved "${data.version.versionName}".`);
  }

  async function onActivate(id: string) {
    setStatus(null);
    const response = await authFetch("/api/score-lab/versions/activate", { id });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(data.error ?? "Failed to activate version.");
      return;
    }
    const updated = await reloadVersions();
    const active = updated.find((v) => v.isActive);
    setStatus(`Activated "${active?.versionName ?? id}". Live scores now use it.`);
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
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Formula versions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className="flex items-center gap-2 text-left text-sm"
                >
                  <span
                    className={
                      version.id === selectedVersionId ? "font-semibold" : "font-medium"
                    }
                  >
                    {version.versionName}
                  </span>
                  {version.isActive && <Badge variant="secondary">Active</Badge>}
                  {version.id === selectedVersionId && !version.isActive && (
                    <Badge variant="outline">Editing</Badge>
                  )}
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/15 bg-white/5 hover:bg-white/10"
                  disabled={version.isActive}
                  onClick={() => onActivate(version.id)}
                >
                  {version.isActive ? "Active" : "Activate"}
                </Button>
              </div>
            ))}
          </div>
          {status && <p className="text-xs text-indigo-300">{status}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ScoreFormulaEditor
          key={selectedVersion?.id}
          version={selectedVersion}
          onSimulate={onSimulate}
          onSaveNew={onSaveNew}
        />
        <ScoreSimulatorPanel simulation={simulation} />
      </div>

      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Backtesting mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {backtest.map((row) => (
            <div key={row.versionName} className="rounded-md border border-white/10 p-3">
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
