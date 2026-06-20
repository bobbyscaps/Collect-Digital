import type {
  AlertType,
  CollectionEvaluation,
  CollectionMarketSnapshot,
} from "@/lib/types";

export interface AlertSignal {
  type: AlertType;
  title: string;
  severity: "info" | "warning" | "critical";
  description: string;
}

export function detectCollectionAlerts(
  current: CollectionEvaluation,
  previous?: CollectionMarketSnapshot
): AlertSignal[] {
  const alerts: AlertSignal[] = [];
  const snapshot = current.marketSnapshot;

  if (snapshot.floorChange24hPct >= 12) {
    alerts.push({
      type: "floor_up",
      title: "Floor moved up sharply",
      severity: "info",
      description: `${snapshot.floorChange24hPct.toFixed(1)}% floor increase over 24h.`,
    });
  }

  if (snapshot.floorChange24hPct <= -12) {
    alerts.push({
      type: "floor_down",
      title: "Floor dropped quickly",
      severity: "warning",
      description: `${snapshot.floorChange24hPct.toFixed(1)}% floor decrease over 24h.`,
    });
  }

  const topOfferToFloor = snapshot.floorPriceEth
    ? snapshot.topOfferEth / snapshot.floorPriceEth
    : 0;
  if (topOfferToFloor > 0.92) {
    alerts.push({
      type: "top_offer_near_floor",
      title: "Top offer near floor",
      severity: "info",
      description:
        "Offer spread is tight, which can support fast exits for holders.",
    });
  }

  if (snapshot.listedPct > 18) {
    alerts.push({
      type: "listing_percentage_rising",
      title: "Supply pressure building",
      severity: "warning",
      description: `${snapshot.listedPct.toFixed(1)}% of supply is listed.`,
    });
  }

  if (snapshot.volume24hEth > snapshot.volume7dEth / 3) {
    alerts.push({
      type: "volume_spike",
      title: "Volume spike detected",
      severity: "info",
      description: "24h volume is elevated compared with recent baseline.",
    });
  }

  if (previous && previous.topOfferEth > 0) {
    const topOfferChange = (snapshot.topOfferEth - previous.topOfferEth) / previous.topOfferEth;
    if (topOfferChange > 0.2) {
      alerts.push({
        type: "top_offer_increase",
        title: "Top offer increased",
        severity: "info",
        description: `Top offer rose ${(topOfferChange * 100).toFixed(1)}% from prior snapshot.`,
      });
    }
  }

  return alerts;
}
