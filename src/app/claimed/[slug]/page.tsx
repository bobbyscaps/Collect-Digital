import { ProjectProfileEditor } from "@/components/claimed/project-profile-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClaimedProjectPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ClaimedProjectPage({ params }: ClaimedProjectPageProps) {
  const { slug } = await params;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Claimed project dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Founder claim is a monthly plan. Submit official updates, milestones, and
          profile links for verification. Verified and relevant updates can improve CD
          score inputs while scores remain formula-driven.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{slug} profile tools</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectProfileEditor slug={slug} />
        </CardContent>
      </Card>
    </div>
  );
}
