"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CommunityContributionSubmission,
  FounderClaimUpdateSubmission,
  ProjectTimelineEvent,
} from "@/lib/types";

interface GovernanceHubProps {
  slug: string;
}

interface GovernanceApiPayload {
  governance: {
    founderUpdates: FounderClaimUpdateSubmission[];
    communityContributions: CommunityContributionSubmission[];
    timeline: ProjectTimelineEvent[];
    communityMonthlyLimit: number;
  };
  pricing: {
    founderClaimMonthlyFeeUsd: number;
    communityContributionFeeUsd: number;
  };
}

interface FounderFormState {
  walletAddress: string;
  founders: string;
  roadmap: string;
  website: string;
  x: string;
  revenue: string;
  token: string;
  majorMilestoneTitle: string;
  majorMilestoneDescription: string;
  majorMilestoneDate: string;
  monthlyFeeConfirmed: boolean;
}

interface CommunityFormState {
  walletAddress: string;
  feedback: string;
  majorEventTitle: string;
  majorEventDescription: string;
  majorEventDate: string;
  contributionFeeConfirmed: boolean;
}

const initialFounderForm: FounderFormState = {
  walletAddress: "",
  founders: "",
  roadmap: "",
  website: "",
  x: "",
  revenue: "",
  token: "",
  majorMilestoneTitle: "",
  majorMilestoneDescription: "",
  majorMilestoneDate: "",
  monthlyFeeConfirmed: false,
};

const initialCommunityForm: CommunityFormState = {
  walletAddress: "",
  feedback: "",
  majorEventTitle: "",
  majorEventDescription: "",
  majorEventDate: "",
  contributionFeeConfirmed: false,
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString();
}

export function GovernanceHub({ slug }: GovernanceHubProps) {
  const [payload, setPayload] = useState<GovernanceApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [founderSaving, setFounderSaving] = useState(false);
  const [communitySaving, setCommunitySaving] = useState(false);
  const [founderForm, setFounderForm] = useState<FounderFormState>(initialFounderForm);
  const [communityForm, setCommunityForm] =
    useState<CommunityFormState>(initialCommunityForm);
  const [founderMessage, setFounderMessage] = useState<string | null>(null);
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);
  const [founderError, setFounderError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);

  async function reloadGovernance() {
    const response = await fetch(`/api/collections/${slug}/governance`);
    const data = (await response.json()) as GovernanceApiPayload;
    setPayload(data);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/collections/${slug}/governance`);
        const data = (await response.json()) as GovernanceApiPayload;
        if (!active) {
          return;
        }
        setPayload(data);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  const runtimeYears = useMemo(() => {
    const start = payload?.governance.timeline?.[0]?.occurredAt;
    if (!start) {
      return null;
    }
    const years =
      (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.max(0, years);
  }, [payload]);

  async function onFounderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFounderSaving(true);
    setFounderMessage(null);
    setFounderError(null);
    const response = await fetch(`/api/collections/${slug}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(founderForm),
    });
    const data = (await response.json()) as { success: boolean; message?: string };
    setFounderSaving(false);
    if (!response.ok || !data.success) {
      setFounderError(data.message ?? "Founder claim submission failed.");
      return;
    }
    setFounderMessage(data.message ?? "Founder update submitted.");
    setFounderForm(initialFounderForm);
    await reloadGovernance();
  }

  async function onCommunitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommunitySaving(true);
    setCommunityMessage(null);
    setCommunityError(null);
    const response = await fetch(`/api/collections/${slug}/contributions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(communityForm),
    });
    const data = (await response.json()) as { success: boolean; message?: string };
    setCommunitySaving(false);
    if (!response.ok || !data.success) {
      setCommunityError(data.message ?? "Community contribution failed.");
      return;
    }
    setCommunityMessage(data.message ?? "Contribution accepted.");
    setCommunityForm(initialCommunityForm);
    await reloadGovernance();
  }

  if (loading || !payload) {
    return <p className="text-sm text-muted-foreground">Loading governance tools...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={onFounderSubmit} className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">Founder claim (monthly)</p>
            <p className="text-xs text-muted-foreground">
              Monthly fee: ${payload.pricing.founderClaimMonthlyFeeUsd}. Verified updates
              can improve CD score.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Founder wallet</Label>
            <Input
              value={founderForm.walletAddress}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, walletAddress: event.target.value }))
              }
              placeholder="0x..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Founder/team update</Label>
            <Textarea
              value={founderForm.founders}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, founders: event.target.value }))
              }
              placeholder="Founder names, bios, and team updates"
            />
          </div>
          <div className="space-y-2">
            <Label>Roadmap update</Label>
            <Textarea
              value={founderForm.roadmap}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, roadmap: event.target.value }))
              }
              placeholder="What shipped recently and what is next"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={founderForm.website}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, website: event.target.value }))
              }
              placeholder="Website URL"
            />
            <Input
              value={founderForm.x}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, x: event.target.value }))
              }
              placeholder="X URL"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={founderForm.revenue}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, revenue: event.target.value }))
              }
              placeholder="Revenue/business details"
            />
            <Input
              value={founderForm.token}
              onChange={(event) =>
                setFounderForm((prev) => ({ ...prev, token: event.target.value }))
              }
              placeholder="Token utility updates"
            />
          </div>
          <div className="space-y-2 rounded-md border p-2">
            <Label>Major milestone (optional)</Label>
            <Input
              value={founderForm.majorMilestoneTitle}
              onChange={(event) =>
                setFounderForm((prev) => ({
                  ...prev,
                  majorMilestoneTitle: event.target.value,
                }))
              }
              placeholder="Milestone title"
            />
            <Textarea
              value={founderForm.majorMilestoneDescription}
              onChange={(event) =>
                setFounderForm((prev) => ({
                  ...prev,
                  majorMilestoneDescription: event.target.value,
                }))
              }
              placeholder="Milestone details"
            />
            <Input
              type="date"
              value={founderForm.majorMilestoneDate}
              onChange={(event) =>
                setFounderForm((prev) => ({
                  ...prev,
                  majorMilestoneDate: event.target.value,
                }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={founderForm.monthlyFeeConfirmed}
              onChange={(event) =>
                setFounderForm((prev) => ({
                  ...prev,
                  monthlyFeeConfirmed: event.target.checked,
                }))
              }
            />
            Monthly founder claim fee confirmed
          </label>
          <Button type="submit" disabled={founderSaving}>
            {founderSaving ? "Submitting..." : "Submit founder claim update"}
          </Button>
          {founderMessage ? <p className="text-xs text-emerald-600">{founderMessage}</p> : null}
          {founderError ? <p className="text-xs text-red-500">{founderError}</p> : null}
        </form>

        <form onSubmit={onCommunitySubmit} className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="font-medium">Community contribution claim</p>
            <p className="text-xs text-muted-foreground">
              Max {payload.governance.communityMonthlyLimit} submissions per wallet/month.
              Ownership is verified before acceptance. Fee: $
              {payload.pricing.communityContributionFeeUsd}.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Contributor wallet</Label>
            <Input
              value={communityForm.walletAddress}
              onChange={(event) =>
                setCommunityForm((prev) => ({
                  ...prev,
                  walletAddress: event.target.value,
                }))
              }
              placeholder="0x..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Feedback for CD score</Label>
            <Textarea
              value={communityForm.feedback}
              onChange={(event) =>
                setCommunityForm((prev) => ({ ...prev, feedback: event.target.value }))
              }
              placeholder="Evidence-backed feedback (risks, strengths, execution quality)"
              required
            />
          </div>
          <div className="space-y-2 rounded-md border p-2">
            <Label>Major project event (optional)</Label>
            <Input
              value={communityForm.majorEventTitle}
              onChange={(event) =>
                setCommunityForm((prev) => ({
                  ...prev,
                  majorEventTitle: event.target.value,
                }))
              }
              placeholder="Event title"
            />
            <Textarea
              value={communityForm.majorEventDescription}
              onChange={(event) =>
                setCommunityForm((prev) => ({
                  ...prev,
                  majorEventDescription: event.target.value,
                }))
              }
              placeholder="Why this event matters"
            />
            <Input
              type="date"
              value={communityForm.majorEventDate}
              onChange={(event) =>
                setCommunityForm((prev) => ({
                  ...prev,
                  majorEventDate: event.target.value,
                }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={communityForm.contributionFeeConfirmed}
              onChange={(event) =>
                setCommunityForm((prev) => ({
                  ...prev,
                  contributionFeeConfirmed: event.target.checked,
                }))
              }
            />
            Community anti-bot fee confirmed
          </label>
          <Button type="submit" variant="secondary" disabled={communitySaving}>
            {communitySaving ? "Submitting..." : "Submit community contribution"}
          </Button>
          {communityMessage ? (
            <p className="text-xs text-emerald-600">{communityMessage}</p>
          ) : null}
          {communityError ? <p className="text-xs text-red-500">{communityError}</p> : null}
        </form>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Project timeline</p>
            <p className="text-xs text-muted-foreground">
              Visual history of founder and community-verified milestones.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Runtime: {runtimeYears ? `${runtimeYears.toFixed(1)} years` : "unknown"}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {payload.governance.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No milestones yet. Founder and community submissions will appear here.
            </p>
          ) : (
            payload.governance.timeline.map((event) => (
              <div key={event.id} className="relative pl-5">
                <span className="absolute left-1 top-2 h-2 w-2 rounded-full bg-primary" />
                <div className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{event.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(event.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {event.source} · {event.verified ? "verified" : "pending"} · by{" "}
                    {event.submittedBy}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
