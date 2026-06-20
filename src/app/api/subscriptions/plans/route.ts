import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    plans: [
      {
        key: "free",
        name: "Free",
        features: [
          "Basic project score",
          "Basic collection page",
          "Basic wallet valuation",
        ],
      },
      {
        key: "pro",
        name: "Pro",
        priceUsdMonthly: 29,
        features: [
          "Full scoring breakdown",
          "Portfolio alerts",
          "Top mover alerts",
          "Historical score changes",
          "Sell signals",
          "Watchlists",
        ],
      },
    ],
  });
}
