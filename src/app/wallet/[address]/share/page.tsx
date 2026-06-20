import { WalletShareCard } from "@/components/wallet/wallet-share-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_WALLET_METRICS } from "@/lib/mock-data";
import { computeWalletCollectorRating } from "@/lib/scoring/wallet-collector";

interface WalletSharePageProps {
  params: Promise<{ address: string }>;
}

export default async function WalletSharePage({ params }: WalletSharePageProps) {
  const { address } = await params;
  const rating = computeWalletCollectorRating({
    ...MOCK_WALLET_METRICS,
    walletAddress: address,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Wallet rating card</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Shareable wallet identity card with collector and flipper scores.
        </CardContent>
      </Card>
      <WalletShareCard rating={rating} />
    </div>
  );
}
