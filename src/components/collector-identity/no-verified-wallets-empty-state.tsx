"use client";

import React from "react";

import { VerifyWalletFlow } from "@/components/collector-identity/verify-wallet-flow";
import {
  NO_VERIFIED_WALLETS_DESCRIPTION,
  NO_VERIFIED_WALLETS_TITLE,
} from "@/components/collector-identity/no-verified-wallets";

export {
  hasNoVerifiedWallets,
  NO_VERIFIED_WALLETS_DESCRIPTION,
  NO_VERIFIED_WALLETS_TITLE,
} from "@/components/collector-identity/no-verified-wallets";

export type NoVerifiedWalletsEmptyStateProps = {
  className?: string;
  /** Refetch Collector Identity after verification / sync outcomes. */
  onIdentityRefresh: () => void;
  /**
   * Notifies the parent when an in-flight verification/sync session should keep
   * this panel mounted even after verified wallets appear in identity.
   */
  onSessionActiveChange?: (active: boolean) => void;
};

/**
 * Intentional empty state for collectors with no verified wallets.
 * Hosts the full Verify Wallet registration → signature → sync flow.
 */
export function NoVerifiedWalletsEmptyState({
  className,
  onIdentityRefresh,
  onSessionActiveChange,
}: NoVerifiedWalletsEmptyStateProps) {
  return (
    <div data-testid="no-verified-wallets-empty-state">
      <p className="sr-only" data-testid="no-verified-wallets-title">
        {NO_VERIFIED_WALLETS_TITLE}
      </p>
      <p className="sr-only" data-testid="no-verified-wallets-description">
        {NO_VERIFIED_WALLETS_DESCRIPTION}
      </p>
      <VerifyWalletFlow
        className={className}
        onIdentityRefresh={onIdentityRefresh}
        onSessionActiveChange={onSessionActiveChange}
      />
    </div>
  );
}
