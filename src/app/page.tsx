import { Sparkles } from "lucide-react";

import { SearchRatingWorkbench } from "@/components/home/search-rating-workbench";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-cyan-500/15 p-6">
        <Badge variant="secondary" className="w-fit">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Search + Rate MVP
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Search any NFT collection and generate your own rating.
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          This MVP is focused on one thing: find projects fast, see a base score,
          then adjust weight gauges to decide what matters most and create your own
          custom rating.
        </p>
      </section>

      <section>
        <SearchRatingWorkbench />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>How the MVP rating works</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Search across providers</p>
              <p className="text-xs text-muted-foreground">
                Results are aggregated from Reservoir + OpenSea enrichment paths.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Instant base score</p>
              <p className="text-xs text-muted-foreground">
                Every result includes a baseline rating so you can triage quickly.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">User-controlled gauges</p>
              <p className="text-xs text-muted-foreground">
                Move category weights to reflect your own investing style.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Configurable scoring core</p>
              <p className="text-xs text-muted-foreground">
                The same model engine remains configurable for deeper tuning.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
