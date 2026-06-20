import { notFound } from "next/navigation";

import { ContributionForm } from "@/components/upgrade/contribution-form";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_UPGRADE_CAMPAIGNS } from "@/lib/mock-data";

interface UpgradePageProps {
  params: Promise<{ slug: string }>;
}

export default async function UpgradePage({ params }: UpgradePageProps) {
  const { slug } = await params;
  const campaign = MOCK_UPGRADE_CAMPAIGNS.find((item) => item.collectionSlug === slug);

  if (!campaign) {
    return notFound();
  }

  const progress = (campaign.raisedUsd / campaign.targetUsd) * 100;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Community-funded full evaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{slug}</h1>
            <Badge>{campaign.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Full Evaluation Progress: ${campaign.raisedUsd} / ${campaign.targetUsd}
          </p>
          <Progress value={progress} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What unlocks when funded</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• Deeper social review</p>
            <p>• Founder profile and execution history</p>
            <p>• Community audit and reward review</p>
            <p>• IRL experience + art/culture review</p>
            <p>• Revenue and risk review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contributor rewards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• Badge + recognition on project page</p>
            <p>• Early access to full report</p>
            <p>• Reputation points</p>
            <p>• Verified holder participation weighting</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ContributionForm collectionSlug={slug} />
        <Card>
          <CardHeader>
            <CardTitle>Trust rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Scores are formula-driven and versioned.</p>
            <p>Campaign funding cannot directly increase any category score.</p>
            <p>All sponsored, claimed, and upgraded status labels remain visible.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
