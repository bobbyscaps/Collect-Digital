import { ScoreLabWorkbench } from "@/components/admin/score-lab-workbench";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listScoringVersions } from "@/lib/scoring/repository";

export default async function ScoreLabPage() {
  const versions = await listScoringVersions();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Score Lab</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Adjust category weights, factor rules, and normalization methods without code
            changes.
          </p>
          <p>
            This lab is designed for iterative experimentation with longevity, business
            revenue, founder influence, IRL experiences, rewards, and liquidity factors.
          </p>
        </CardContent>
      </Card>

      <ScoreLabWorkbench versions={versions} />
    </div>
  );
}
