import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ScoreSimulationResult } from "@/lib/types";

interface ScoreSimulatorPanelProps {
  simulation: ScoreSimulationResult | null;
}

export function ScoreSimulatorPanel({ simulation }: ScoreSimulatorPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Simulator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!simulation ? (
          <p className="text-muted-foreground">
            Select a collection and adjust the formula to preview score impact.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Baseline score</span>
              <Badge variant="outline">{simulation.baseline.overallScore}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Simulated score</span>
              <Badge variant="secondary">{simulation.simulated.overallScore}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Delta</span>
              <Badge
                variant="outline"
                className={
                  simulation.delta >= 0 ? "border-emerald-500/60" : "border-rose-500/60"
                }
              >
                {simulation.delta >= 0 ? "+" : ""}
                {simulation.delta}
              </Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
