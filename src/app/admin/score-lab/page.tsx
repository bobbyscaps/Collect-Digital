import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { AdminGate } from "@/components/admin/admin-gate";
import { ScoreLabWorkbench } from "@/components/admin/score-lab-workbench";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listScoringVersions } from "@/lib/scoring/repository";

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
        CD
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Collect<span className="text-muted-foreground"> Digital</span>
      </span>
    </div>
  );
}

export default async function ScoreLabPage() {
  const versions = await listScoringVersions();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_72%)]" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Collect Digital home">
          <Wordmark />
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" />
          Admin
        </span>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 sm:px-6">
        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-indigo-300" />
              Score Lab
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Adjust category weights, factor rules, and normalization methods to
              tune the Collect Digital rating — no code changes required.
            </p>
            <p>
              Reorder categories, tune per-factor weights and caps, then run a live
              simulation to preview the score impact before shipping a new formula
              version.
            </p>
          </CardContent>
        </Card>

        <AdminGate>
          <ScoreLabWorkbench versions={versions} />
        </AdminGate>
      </main>
    </div>
  );
}
