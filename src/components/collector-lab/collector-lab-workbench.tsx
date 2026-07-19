"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  COLLECTOR_SUB_SCORE_LABELS,
  COLLECTOR_SUB_SCORE_ORDER,
  type CollectorSubScoreWeights,
  type CollectorSubScores,
} from "@/lib/scoring/wallet-collector";

type SimResult = {
  identifier: string;
  source: "onchain" | "synthetic";
  subScores: CollectorSubScores;
  baseline: { collectorScore: number };
  candidate: { collectorScore: number };
};

function toSliderWeights(weights: CollectorSubScoreWeights): CollectorSubScoreWeights {
  // Display fractional weights on a 0-100 point scale (blend normalizes anyway).
  const scaled = {} as CollectorSubScoreWeights;
  for (const key of COLLECTOR_SUB_SCORE_ORDER) {
    scaled[key] = Math.round((weights[key] ?? 0) * 100);
  }
  return scaled;
}

export function CollectorLabWorkbench() {
  const [weights, setWeights] = useState<CollectorSubScoreWeights | null>(null);
  const [defaults, setDefaults] = useState<CollectorSubScoreWeights | null>(null);
  const [identifier, setIdentifier] = useState("satoshi");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/collector-lab/weights");
      const data = (await res.json()) as {
        active: CollectorSubScoreWeights;
        default: CollectorSubScoreWeights;
      };
      setWeights(toSliderWeights(data.active));
      setDefaults(toSliderWeights(data.default));
    }
    void load();
  }, []);

  const total = useMemo(
    () =>
      weights
        ? COLLECTOR_SUB_SCORE_ORDER.reduce((acc, key) => acc + (weights[key] ?? 0), 0)
        : 0,
    [weights]
  );

  function updateWeight(key: keyof CollectorSubScoreWeights, value: number) {
    setWeights((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSimulate() {
    if (!weights) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/collector-lab/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, weights }),
      });
      const data = (await res.json()) as SimResult;
      setSim(data);
    } finally {
      setBusy(false);
    }
  }

  async function onActivate() {
    if (!weights) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/collector-lab/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      if (!res.ok) {
        setStatus("Failed to activate weights.");
        return;
      }
      setStatus("Activated. Live collector scores now use these weights.");
    } finally {
      setBusy(false);
    }
  }

  if (!weights) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="p-8 text-sm text-muted-foreground">
          Loading formula…
        </CardContent>
      </Card>
    );
  }

  const delta = sim
    ? Math.round((sim.candidate.collectorScore - sim.baseline.collectorScore) * 10) / 10
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Collector Formula Weights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Total weight</Label>
            <Badge variant="outline">{total} pts</Badge>
          </div>

          {COLLECTOR_SUB_SCORE_ORDER.map((key) => (
            <div
              key={key}
              className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{COLLECTOR_SUB_SCORE_LABELS[key]}</span>
                <Badge variant="outline">{weights[key]} pts</Badge>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={weights[key]}
                onChange={(e) => updateWeight(key, Number(e.target.value))}
                className="w-full"
              />
              <Progress value={total > 0 ? (weights[key] / total) * 100 : 0} />
            </div>
          ))}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username or 0x address"
                className="h-9 w-52 rounded-md border border-white/15 bg-white/5 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-white/30"
              />
              <Button onClick={onSimulate} disabled={busy}>
                {busy ? "Running…" : "Run simulation"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {defaults && (
                <Button
                  variant="outline"
                  className="border-white/15 bg-white/5 hover:bg-white/10"
                  onClick={() => setWeights(defaults)}
                >
                  Reset
                </Button>
              )}
              <Button
                variant="outline"
                className="border-white/15 bg-white/5 hover:bg-white/10"
                onClick={onActivate}
                disabled={busy}
              >
                Save &amp; activate
              </Button>
            </div>
          </div>
          {status && <p className="text-xs text-indigo-300">{status}</p>}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Simulation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!sim ? (
            <p className="text-muted-foreground">
              Enter a collector username or wallet address and run a simulation to
              preview the score impact.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {sim.identifier} · {sim.source === "onchain" ? "on-chain" : "sample"} data
              </p>
              <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
                <span>Active score</span>
                <Badge variant="outline">{sim.baseline.collectorScore}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
                <span>Candidate score</span>
                <Badge variant="secondary">{sim.candidate.collectorScore}</Badge>
              </div>
              {delta !== null && (
                <p
                  className={
                    delta >= 0 ? "text-sm text-emerald-300" : "text-sm text-amber-300"
                  }
                >
                  Δ {delta >= 0 ? "+" : ""}
                  {delta} vs active formula
                </p>
              )}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Sub-scores
                </p>
                {COLLECTOR_SUB_SCORE_ORDER.map((key) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {COLLECTOR_SUB_SCORE_LABELS[key]}
                      </span>
                      <span>{Math.round(sim.subScores[key])}</span>
                    </div>
                    <Progress value={Math.round(sim.subScores[key])} />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
