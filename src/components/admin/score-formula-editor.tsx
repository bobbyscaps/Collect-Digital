"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { ScoreCategoryKey, ScoringModelVersion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const LABELS: Record<ScoreCategoryKey, string> = {
  market_health: "Market Health",
  liquidity: "Liquidity",
  community_strength: "Community Strength",
  builder_team: "Builder / Team",
  product_utility: "Product / Utility",
  culture_art_brand: "Culture / Art / Brand",
  holder_value_rewards: "Holder Value / Rewards",
  skin_in_the_game: "Skin in the Game",
};

interface FormulaEditorProps {
  version: ScoringModelVersion;
  onSimulate: (version: ScoringModelVersion) => Promise<void>;
}

function SortableRow({
  id,
  points,
  onChange,
}: {
  id: ScoreCategoryKey;
  points: number;
  onChange: (next: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-2 rounded-lg border border-border/60 bg-background p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="cursor-grab text-left text-sm font-medium active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          {LABELS[id]}
        </button>
        <Badge variant="outline">{points.toFixed(1)} pts</Badge>
      </div>
      <input
        type="range"
        min={0}
        max={40}
        step={0.5}
        value={points}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
      <Progress value={(points / 40) * 100} />
    </div>
  );
}

export function ScoreFormulaEditor({ version, onSimulate }: FormulaEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor));
  const [localVersion, setLocalVersion] = useState<ScoringModelVersion>(version);
  const [orderedKeys, setOrderedKeys] = useState<ScoreCategoryKey[]>(
    Object.keys(version.categoryWeights) as ScoreCategoryKey[]
  );
  const [loading, setLoading] = useState(false);

  const totalPoints = useMemo(
    () =>
      orderedKeys.reduce(
        (acc, key) => acc + (localVersion.categoryWeights[key] ?? 0),
        0
      ),
    [localVersion.categoryWeights, orderedKeys]
  );

  function updatePoints(key: ScoreCategoryKey, points: number) {
    setLocalVersion((prev) => ({
      ...prev,
      categoryWeights: {
        ...prev.categoryWeights,
        [key]: points,
      },
    }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = orderedKeys.indexOf(active.id as ScoreCategoryKey);
    const newIndex = orderedKeys.indexOf(over.id as ScoreCategoryKey);
    setOrderedKeys((items) => arrayMove(items, oldIndex, newIndex));
  }

  function updateFactor(
    index: number,
    patch: Partial<ScoringModelVersion["factorRules"][number]>
  ) {
    setLocalVersion((prev) => ({
      ...prev,
      factorRules: prev.factorRules.map((factor, factorIndex) =>
        factorIndex === index ? { ...factor, ...patch } : factor
      ),
    }));
  }

  async function handleSimulate() {
    setLoading(true);
    await onSimulate(localVersion);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Formula Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Total category points</Label>
          <Badge variant={Math.round(totalPoints) === 100 ? "secondary" : "outline"}>
            {totalPoints.toFixed(1)} / 100
          </Badge>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {orderedKeys.map((key) => (
                <SortableRow
                  key={key}
                  id={key}
                  points={localVersion.categoryWeights[key]}
                  onChange={(value) => updatePoints(key, value)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex items-center justify-end">
          <Button onClick={handleSimulate} disabled={loading}>
            {loading ? "Running simulation..." : "Run live simulation"}
          </Button>
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label>Factor rule editor</Label>
          <p className="text-xs text-muted-foreground">
            Enable/disable factors, tune factor weights, and switch normalization without
            code changes.
          </p>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {localVersion.factorRules.map((factor, index) => (
              <div key={factor.key} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{factor.label}</p>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={factor.enabled}
                      onChange={(event) =>
                        updateFactor(index, { enabled: event.target.checked })
                      }
                    />
                    enabled
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">{factor.sourceMetric}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <label className="text-xs">
                    Weight
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={factor.weight}
                      onChange={(event) =>
                        updateFactor(index, { weight: Number(event.target.value) })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="text-xs">
                    Min cap
                    <input
                      type="number"
                      value={factor.minValue ?? 0}
                      onChange={(event) =>
                        updateFactor(index, { minValue: Number(event.target.value) })
                      }
                      className="mt-1 w-full rounded-md border px-2 py-1"
                    />
                  </label>
                  <label className="text-xs">
                    Max cap
                    <input
                      type="number"
                      value={factor.maxValue ?? 1}
                      onChange={(event) =>
                        updateFactor(index, { maxValue: Number(event.target.value) })
                      }
                      className="mt-1 w-full rounded-md border px-2 py-1"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs">
                  Normalization
                  <select
                    value={factor.normalization}
                    onChange={(event) =>
                      updateFactor(index, {
                        normalization: event.target.value as ScoringModelVersion["factorRules"][number]["normalization"],
                      })
                    }
                    className="mt-1 w-full rounded-md border px-2 py-1"
                  >
                    <option value="min_max">min_max</option>
                    <option value="inverse_min_max">inverse_min_max</option>
                    <option value="boolean">boolean</option>
                    <option value="z_score_cap">z_score_cap</option>
                    <option value="sigmoid">sigmoid</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
