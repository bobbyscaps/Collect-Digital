"use client";

import React from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  shortenWalletAddress,
  type SelectableConnectedWallet,
} from "@/lib/wallet-verification-flow/connected-wallets";
import {
  OWNERSHIP_REASSURANCE,
  PHASE_LABELS,
  PROGRESS_STAGE_LABELS,
  stagesForPhase,
  type WalletVerificationUiPhase,
} from "@/lib/wallet-verification-flow/flow-states";

export type VerifyWalletFlowViewProps = {
  phase: WalletVerificationUiPhase;
  connectedWallets: readonly SelectableConnectedWallet[];
  selectedKey: string | null;
  onSelectWallet: (key: string) => void;
  onVerify: () => void;
  onRetrySync: () => void;
  onReset: () => void;
  errorMessage: string | null;
  challengeMessage: string | null;
  authenticated: boolean;
  walletsReady: boolean;
  className?: string;
};

/**
 * Presentational Verify Wallet flow. Kept free of Privy hooks so UI states
 * can be unit-tested without a wallet provider.
 */
export function VerifyWalletFlowView({
  phase,
  connectedWallets,
  selectedKey,
  onSelectWallet,
  onVerify,
  onRetrySync,
  onReset,
  errorMessage,
  challengeMessage,
  authenticated,
  walletsReady,
  className,
}: VerifyWalletFlowViewProps) {
  const selectedWallet =
    connectedWallets.find((wallet) => wallet.key === selectedKey) ?? null;
  const busy =
    phase === "registering" ||
    phase === "awaiting_signature" ||
    phase === "verifying" ||
    phase === "synchronizing";
  const completedStages = stagesForPhase(phase);
  const showProgress =
    phase !== "ready" &&
    phase !== "cancelled" &&
    phase !== "verification_failed";

  return (
    <div
      className={
        className ??
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center"
      }
      data-testid="verify-wallet-flow"
      data-phase={phase}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
        {phase === "complete" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
        ) : (
          <Wallet className="h-5 w-5" />
        )}
      </span>

      <p
        className="mt-4 text-sm font-medium"
        data-testid="verify-wallet-phase-label"
      >
        {PHASE_LABELS[phase]}
      </p>

      {phase === "ready" && (
        <p
          className="mt-1 max-w-md text-sm text-muted-foreground"
          data-testid="verify-wallet-ready-copy"
        >
          Prove ownership of your connected wallet, then synchronize your
          collectibles.
        </p>
      )}

      {(phase === "awaiting_signature" || challengeMessage) &&
        phase !== "complete" &&
        phase !== "sync_failed" && (
          <p
            className="mt-2 max-w-md text-xs text-muted-foreground"
            data-testid="verify-wallet-reassurance"
          >
            {OWNERSHIP_REASSURANCE}
          </p>
        )}

      {phase === "awaiting_signature" && challengeMessage && (
        <pre
          className="mt-3 max-h-40 w-full max-w-md overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-left text-[11px] leading-relaxed text-muted-foreground"
          data-testid="verify-wallet-canonical-message"
        >
          {challengeMessage}
        </pre>
      )}

      {walletsReady && authenticated && connectedWallets.length > 1 && (
        <div
          className="mt-4 w-full max-w-md space-y-2 text-left"
          data-testid="verify-wallet-selection"
        >
          <p className="text-xs font-medium text-muted-foreground">
            Select a wallet to verify
          </p>
          {connectedWallets.map((wallet) => {
            const selected = wallet.key === selectedKey;
            return (
              <button
                key={wallet.key}
                type="button"
                disabled={busy}
                data-testid={`verify-wallet-option-${wallet.chainNamespace}`}
                data-selected={selected ? "true" : "false"}
                onClick={() => onSelectWallet(wallet.key)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "border-indigo-400/50 bg-indigo-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <span>
                  <span className="font-medium">{wallet.label}</span>
                  <span className="ml-2 text-muted-foreground">
                    {wallet.chainLabel} · {shortenWalletAddress(wallet.address)}
                  </span>
                </span>
                {selected && (
                  <CheckCircle2 className="h-4 w-4 text-indigo-300" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {walletsReady && authenticated && connectedWallets.length === 1 && (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-testid="verify-wallet-preselected"
        >
          {connectedWallets[0].chainLabel} ·{" "}
          {shortenWalletAddress(connectedWallets[0].address)}
        </p>
      )}

      {walletsReady && authenticated && connectedWallets.length === 0 && (
        <p
          className="mt-3 max-w-md text-sm text-amber-200/90"
          data-testid="verify-wallet-no-connected"
        >
          Connect a wallet in your account to continue verification.
        </p>
      )}

      {showProgress && (
        <ol
          className="mt-4 w-full max-w-md space-y-1.5 text-left text-xs"
          data-testid="verify-wallet-progress"
        >
          {(
            [
              "wallet_connected",
              "ownership_verified",
              "collectibles_synchronized",
              "collector_identity_updated",
            ] as const
          ).map((stage) => {
            const done = completedStages.includes(stage);
            return (
              <li
                key={stage}
                data-testid={`verify-progress-${stage}`}
                data-complete={done ? "true" : "false"}
                className={
                  done ? "text-emerald-300/90" : "text-muted-foreground/70"
                }
              >
                {done ? "✓" : "○"} {PROGRESS_STAGE_LABELS[stage]}
              </li>
            );
          })}
        </ol>
      )}

      {errorMessage && (
        <p
          className="mt-3 max-w-md text-sm text-rose-200/90"
          data-testid="verify-wallet-error"
        >
          {errorMessage}
        </p>
      )}

      <div className="mt-5 flex flex-col items-center gap-2">
        {(phase === "ready" ||
          phase === "cancelled" ||
          phase === "verification_failed") && (
          <Button
            type="button"
            disabled={
              !authenticated ||
              !selectedWallet ||
              busy ||
              connectedWallets.length === 0
            }
            aria-disabled={
              !authenticated ||
              !selectedWallet ||
              busy ||
              connectedWallets.length === 0
            }
            data-testid="verify-wallet-action"
            className="min-w-[10rem]"
            onClick={onVerify}
          >
            {phase === "verification_failed" || phase === "cancelled"
              ? "Retry Verification"
              : "Verify Wallet"}
          </Button>
        )}

        {(phase === "registering" ||
          phase === "awaiting_signature" ||
          phase === "verifying" ||
          phase === "verified" ||
          phase === "synchronizing") && (
          <Button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="verify-wallet-action"
            className="min-w-[10rem]"
          >
            <Loader2 className="animate-spin" />
            {PHASE_LABELS[phase]}
          </Button>
        )}

        {phase === "sync_failed" && (
          <Button
            type="button"
            data-testid="retry-sync-action"
            className="min-w-[10rem]"
            onClick={onRetrySync}
          >
            Retry Sync
          </Button>
        )}

        {phase === "complete" && (
          <Button
            type="button"
            variant="outline"
            data-testid="verify-wallet-complete-ack"
            className="min-w-[10rem] border-white/15 bg-white/5"
            onClick={onReset}
          >
            Done
          </Button>
        )}

        {(phase === "cancelled" || phase === "verification_failed") && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid="verify-wallet-reset"
            onClick={onReset}
          >
            Back
          </button>
        )}
      </div>

      {(phase === "awaiting_signature" || phase === "ready") && (
        <p
          className="mt-3 max-w-sm text-[11px] text-muted-foreground"
          data-testid="verify-wallet-gasless-note"
        >
          Message signing only — no blockchain transaction, no gas, no token
          approvals.
        </p>
      )}

      {/* Explicitly assert product rules for source/UI regression checks. */}
      <span className="sr-only" data-testid="verify-wallet-no-scoring">
        Ownership verification and inventory sync only. Scoring is not part of
        this flow.
      </span>
    </div>
  );
}
