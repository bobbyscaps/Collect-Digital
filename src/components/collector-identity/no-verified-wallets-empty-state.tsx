"use client";

import React from "react";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CollectorIdentityResponse } from "@/lib/collector-identity/api-models";

export const NO_VERIFIED_WALLETS_TITLE =
  "Verify your wallet to build your Collector Identity";

export const NO_VERIFIED_WALLETS_DESCRIPTION =
  "Prove ownership of your connected wallet, then synchronize your collectibles.";

/**
 * True when the authenticated identity has no verified wallets yet.
 * Inventory/collection empty messages in that case are redundant — use this
 * single intentional empty state instead.
 */
export function hasNoVerifiedWallets(
  identity: CollectorIdentityResponse | null | undefined
): boolean {
  if (!identity) return false;
  if (identity.wallets.state !== "empty") return false;
  return (
    identity.wallets.data == null ||
    identity.wallets.data.verifiedWalletCount === 0
  );
}

/**
 * Intentional empty state for collectors with no verified wallets.
 * Does not start verification, sync, or mutate wallet state.
 */
export function NoVerifiedWalletsEmptyState({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center"
      }
      data-testid="no-verified-wallets-empty-state"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
        <Wallet className="h-5 w-5" />
      </span>
      <p
        className="mt-4 text-sm font-medium"
        data-testid="no-verified-wallets-title"
      >
        {NO_VERIFIED_WALLETS_TITLE}
      </p>
      <p
        className="mt-1 max-w-md text-sm text-muted-foreground"
        data-testid="no-verified-wallets-description"
      >
        {NO_VERIFIED_WALLETS_DESCRIPTION}
      </p>
      <div className="mt-5 flex flex-col items-center gap-1.5">
        <Button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="verify-wallet-action"
          className="min-w-[10rem]"
        >
          Verify Wallet
        </Button>
        <p
          className="text-xs text-muted-foreground"
          data-testid="verify-wallet-coming-next"
        >
          Coming next
        </p>
      </div>
    </div>
  );
}
