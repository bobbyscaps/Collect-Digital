import { DashboardContent } from "@/components/wallet/dashboard-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wallet dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connect any EVM wallet to evaluate collector behavior, flipper skill, and
          portfolio valuation by floor vs best offers.
        </CardContent>
      </Card>
      <DashboardContent />
    </div>
  );
}
