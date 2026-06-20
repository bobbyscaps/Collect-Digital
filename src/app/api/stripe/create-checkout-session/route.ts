import { NextResponse } from "next/server";
import { z } from "zod";

import { getStripeClient } from "@/lib/payments/stripe";

const schema = z.object({
  collectionSlug: z.string(),
  amountUsd: z.number().min(5),
  mode: z.enum(["campaign_upgrade", "subscription"]),
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const stripe = getStripeClient();

  if (!stripe) {
    return NextResponse.json({
      message: "Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout.",
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: {
            name:
              body.mode === "subscription"
                ? "Collect Digital Pro Subscription"
                : `Community-funded evaluation: ${body.collectionSlug}`,
          },
          unit_amount: Math.round(body.amountUsd * 100),
        },
      },
    ],
    success_url: `https://example.com/upgrade/${body.collectionSlug}?success=true`,
    cancel_url: `https://example.com/upgrade/${body.collectionSlug}?cancelled=true`,
    metadata: {
      collectionSlug: body.collectionSlug,
      mode: body.mode,
    },
  });

  return NextResponse.json({ url: session.url });
}
