"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ContributionFormProps {
  collectionSlug: string;
}

export function ContributionForm({ collectionSlug }: ContributionFormProps) {
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onContribute() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionSlug,
        amountUsd: amount,
        mode: "campaign_upgrade",
      }),
    });
    const data = (await response.json()) as { url?: string; message?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setMessage(data.message ?? "Contribution checkout unavailable.");
    setLoading(false);
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Label htmlFor="contribution">Contribution amount (USD)</Label>
      <Input
        id="contribution"
        type="number"
        min={5}
        value={amount}
        onChange={(event) => setAmount(Number(event.target.value))}
      />
      <Button onClick={onContribute} disabled={loading}>
        {loading ? "Preparing checkout..." : "Contribute with Stripe"}
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      <p className="text-xs text-muted-foreground">
        Funding unlocks research depth and profile completeness only. It never buys score
        improvements.
      </p>
    </div>
  );
}
