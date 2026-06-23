"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProjectProfileEditorProps {
  slug: string;
}

export function ProjectProfileEditor({ slug }: ProjectProfileEditorProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(formData: FormData) {
    setSaving(true);
    setSaved(false);
    setError(null);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch(`/api/collections/${slug}/claim`, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        monthlyFeeConfirmed: payload.monthlyFeeConfirmed === "on",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const data = (await response.json()) as { success: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !data.success) {
      setError(data.message ?? "Unable to submit founder update.");
      return;
    }
    setSaved(true);
  }

  return (
    <form
      action={(data) => {
        void onSave(data);
      }}
      className="grid gap-4"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="walletAddress">Founder wallet address</Label>
          <Input
            id="walletAddress"
            name="walletAddress"
            placeholder="0x..."
            required
          />
        </div>
        <label className="mt-7 flex items-center gap-2 text-sm text-muted-foreground">
          <input id="monthlyFeeConfirmed" name="monthlyFeeConfirmed" type="checkbox" />
          Monthly founder claim fee ($39) confirmed
        </label>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="founders">Founder bios</Label>
        <Textarea id="founders" name="founders" placeholder="Founder names and bios" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="team">Team members</Label>
        <Textarea id="team" name="team" placeholder="Team, advisors, contributors" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="roadmap">Roadmap and what you are building</Label>
        <Textarea id="roadmap" name="roadmap" placeholder="Roadmap milestones" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="revenue">Revenue / business model</Label>
          <Input id="revenue" name="revenue" placeholder="Annual revenue, SKU, model" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="token">Token info</Label>
          <Input id="token" name="token" placeholder="Token utility and supply basics" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="website">Official website</Label>
          <Input id="website" name="website" placeholder="https://project.xyz" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="x">X link</Label>
          <Input id="x" name="x" placeholder="https://x.com/project" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discord">Discord link</Label>
          <Input id="discord" name="discord" placeholder="https://discord.gg/project" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telegram">Telegram link</Label>
          <Input id="telegram" name="telegram" placeholder="https://t.me/project" />
        </div>
      </div>
      <div className="grid gap-2 rounded-md border p-3">
        <p className="text-sm font-medium">Major milestone for timeline (optional)</p>
        <Input name="majorMilestoneTitle" placeholder="Milestone title" />
        <Textarea
          name="majorMilestoneDescription"
          placeholder="What changed and why this milestone matters"
        />
        <Input name="majorMilestoneDate" type="date" />
      </div>
      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "Saving..." : "Save claimed profile"}
      </Button>
      {saved ? (
        <p className="text-xs text-muted-foreground">
          Claimed profile submitted for verification queue.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </form>
  );
}
