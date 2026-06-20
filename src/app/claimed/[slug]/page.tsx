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
          Add founder bios, roadmap, reward details, official links, and updates. Scores
          remain formula-driven and cannot be manually edited.
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
