import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WalletCollectorRating } from "@/lib/types";

interface WalletShareCardProps {
  rating: WalletCollectorRating;
}

export function WalletShareCard({ rating }: WalletShareCardProps) {
  return (
    <Card className="bg-gradient-to-br from-violet-700/20 via-indigo-600/15 to-cyan-600/20">
      <CardHeader>
        <CardTitle>Public Share Card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Wallet Rating:{" "}
          <span className="font-semibold text-foreground">
            {rating.mainBadge.label}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          Collector Score:{" "}
          <span className="font-semibold text-foreground">{rating.collectorScore}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Flipper Score:{" "}
          <span className="font-semibold text-foreground">{rating.flipperScore}</span>
        </p>
        <div className="pt-2">
          <Badge>{`Top Badge: ${rating.mainBadge.label}`}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
