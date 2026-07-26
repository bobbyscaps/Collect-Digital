"use client";

import React, { type ReactNode } from "react";
import { AlertTriangle, Clock3, Inbox, Loader2, Sparkles } from "lucide-react";

import type { ProgressiveDataState } from "@/lib/collector-identity/api-models";
import { cn } from "@/lib/utils";

export type ProgressiveDataProps<T> = {
  state: ProgressiveDataState;
  data: T | null;
  lastUpdatedAt?: string | null;
  message?: string | null;
  /** Section title shown in chrome for every state. */
  title?: string;
  className?: string;
  /** Live / stale / partial content renderer. Receives non-null data. */
  render?: (data: T) => ReactNode;
  /** Optional empty-state override. */
  empty?: ReactNode;
  /** Optional error-state override. */
  error?: ReactNode;
  /** Optional coming-soon override. */
  comingSoon?: ReactNode;
  /** Optional loading override. */
  loading?: ReactNode;
};

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StateBanner({
  state,
  message,
  lastUpdatedAt,
}: {
  state: ProgressiveDataState;
  message?: string | null;
  lastUpdatedAt?: string | null;
}) {
  if (state === "live" || state === "loading") return null;

  const formatted = formatTimestamp(lastUpdatedAt);
  const tone =
    state === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
      : state === "stale"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : state === "coming_soon"
          ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-200"
          : "border-white/10 bg-white/5 text-muted-foreground";

  const label =
    state === "stale"
      ? "Stale"
      : state === "partial"
        ? "Partial"
        : state === "empty"
          ? "Empty"
          : state === "error"
            ? "Unavailable"
            : "Coming Soon";

  const Icon =
    state === "stale" || state === "partial"
      ? Clock3
      : state === "error"
        ? AlertTriangle
        : state === "coming_soon"
          ? Sparkles
          : Inbox;

  // For empty / error / coming_soon the body already shows `message` once.
  // Only stale / partial keep contextual message in the banner (with timestamp).
  const bannerMessage =
    state === "stale" || state === "partial" ? message : null;

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs",
        tone
      )}
      data-progressive-state={state}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium uppercase tracking-wider">{label}</span>
      {bannerMessage && (
        <span className="text-[11px] opacity-90">{bannerMessage}</span>
      )}
      {state === "stale" && formatted && (
        <span className="ml-auto text-[11px] opacity-90">
          Last updated {formatted}
        </span>
      )}
      {state === "partial" && formatted && (
        <span className="ml-auto text-[11px] opacity-90">
          As of {formatted}
        </span>
      )}
    </div>
  );
}

/**
 * Reusable progressive data renderer for Collector Identity sections.
 * Future profile modules (achievements, scores, communities) must reuse this.
 */
export function ProgressiveData<T>({
  state,
  data,
  lastUpdatedAt = null,
  message = null,
  title,
  className,
  render,
  empty,
  error,
  comingSoon,
  loading,
}: ProgressiveDataProps<T>) {
  return (
    <div className={cn("min-w-0", className)} data-progressive-root={state}>
      {title && (
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}

      <StateBanner
        state={state}
        message={message}
        lastUpdatedAt={lastUpdatedAt}
      />

      {state === "loading" &&
        (loading ?? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="progressive-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ))}

      {state === "coming_soon" &&
        (comingSoon ?? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="progressive-coming-soon"
          >
            {message ?? "Coming Soon"}
          </p>
        ))}

      {state === "empty" &&
        (empty ?? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="progressive-empty"
          >
            {message ?? "No data yet."}
          </p>
        ))}

      {state === "error" &&
        (error ?? (
          <p
            className="text-sm text-rose-200/90"
            data-testid="progressive-error"
          >
            {message ?? "This section is temporarily unavailable."}
          </p>
        ))}

      {(state === "live" || state === "stale" || state === "partial") &&
        data != null && (
          <div data-testid={`progressive-${state}`}>
            {render ? render(data) : null}
          </div>
        )}

      {(state === "live" || state === "stale" || state === "partial") &&
        data == null && (
          <p className="text-sm text-muted-foreground">
            {message ?? "No data available."}
          </p>
        )}
    </div>
  );
}
