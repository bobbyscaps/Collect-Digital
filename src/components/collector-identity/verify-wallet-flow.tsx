"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  useWallets as useSolanaWallets,
  useSignMessage as useSolanaSignMessage,
} from "@privy-io/react-auth/solana";
import bs58 from "bs58";

import { VerifyWalletFlowView } from "@/components/collector-identity/verify-wallet-flow-view";
import {
  buildSelectableWallet,
  dedupeSelectableWallets,
  type SelectableConnectedWallet,
} from "@/lib/wallet-verification-flow/connected-wallets";
import {
  createWalletVerificationChallenge,
  registerWallet,
  syncVerifiedWalletInventory,
  verifyWalletOwnership,
  WalletVerificationFlowClientError,
} from "@/lib/wallet-verification-flow/client";
import {
  ClientSigningError,
  isUserCancellationError,
  type WalletVerificationUiPhase,
} from "@/lib/wallet-verification-flow/flow-states";

export type VerifyWalletFlowProps = {
  /** Called after successful verification and/or successful sync to refetch identity. */
  onIdentityRefresh: () => void;
  /**
   * Keep the host panel mounted while verification/sync is in progress or
   * awaiting retry, even after Collector Identity already shows verified wallets.
   */
  onSessionActiveChange?: (active: boolean) => void;
  className?: string;
};

function collectConnectedWallets(
  evmWallets: readonly { address: string; meta?: { name?: string } }[],
  solanaWallets: readonly { address: string }[]
): SelectableConnectedWallet[] {
  const mapped: SelectableConnectedWallet[] = [];

  for (const wallet of evmWallets) {
    if (!wallet.address) continue;
    mapped.push(
      buildSelectableWallet({
        address: wallet.address,
        chainNamespace: "eip155",
        label: wallet.meta?.name ?? "EVM Wallet",
      })
    );
  }

  for (const wallet of solanaWallets) {
    if (!wallet.address) continue;
    mapped.push(
      buildSelectableWallet({
        address: wallet.address,
        chainNamespace: "solana",
        label: "Solana Wallet",
      })
    );
  }

  return dedupeSelectableWallets(mapped);
}

function isActiveSessionPhase(phase: WalletVerificationUiPhase): boolean {
  return (
    phase !== "ready" &&
    phase !== "cancelled" &&
    phase !== "verification_failed"
  );
}

export function VerifyWalletFlow({
  onIdentityRefresh,
  onSessionActiveChange,
  className,
}: VerifyWalletFlowProps) {
  const { ready: privyReady, authenticated, getAccessToken } = usePrivy();
  const { wallets: evmWallets, ready: evmReady } = useWallets();
  const { wallets: solanaWallets, ready: solanaReady } = useSolanaWallets();
  const { signMessage: signSolanaMessage } = useSolanaSignMessage();

  const connectedWallets = useMemo(
    () => collectConnectedWallets(evmWallets, solanaWallets),
    [evmWallets, solanaWallets]
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<WalletVerificationUiPhase>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);

  // Preselect when exactly one wallet is connected; never silently pick among many.
  useEffect(() => {
    if (connectedWallets.length === 1) {
      setSelectedKey(connectedWallets[0].key);
      return;
    }
    if (
      selectedKey &&
      !connectedWallets.some((wallet) => wallet.key === selectedKey)
    ) {
      setSelectedKey(null);
    }
  }, [connectedWallets, selectedKey]);

  useEffect(() => {
    onSessionActiveChange?.(isActiveSessionPhase(phase));
  }, [phase, onSessionActiveChange]);

  const selectedWallet = useMemo(
    () => connectedWallets.find((wallet) => wallet.key === selectedKey) ?? null,
    [connectedWallets, selectedKey]
  );

  const walletsReady = privyReady && evmReady && solanaReady;
  const busy =
    phase === "registering" ||
    phase === "awaiting_signature" ||
    phase === "verifying" ||
    phase === "synchronizing";

  const signOwnershipMessage = useCallback(
    async (
      wallet: SelectableConnectedWallet,
      message: string
    ): Promise<string> => {
      if (wallet.chainNamespace === "eip155") {
        const connected = evmWallets.find(
          (candidate) =>
            candidate.address.toLowerCase() === wallet.address.toLowerCase()
        );
        if (!connected || typeof connected.sign !== "function") {
          throw new ClientSigningError(
            "unsupported_capability",
            "This EVM wallet cannot sign messages."
          );
        }
        try {
          return await connected.sign(message);
        } catch (cause) {
          if (isUserCancellationError(cause)) {
            throw new ClientSigningError(
              "user_cancelled",
              "Wallet verification was cancelled."
            );
          }
          throw new ClientSigningError(
            "signing_failed",
            cause instanceof Error
              ? cause.message
              : "Unable to sign the verification message."
          );
        }
      }

      const solanaWallet = solanaWallets.find(
        (candidate) => candidate.address === wallet.address
      );
      if (!solanaWallet) {
        throw new ClientSigningError(
          "unsupported_capability",
          "This Solana wallet cannot sign messages."
        );
      }

      try {
        const encoded = new TextEncoder().encode(message);
        const { signature } = await signSolanaMessage({
          message: encoded,
          wallet: solanaWallet,
        });
        return bs58.encode(signature);
      } catch (cause) {
        if (isUserCancellationError(cause)) {
          throw new ClientSigningError(
            "user_cancelled",
            "Wallet verification was cancelled."
          );
        }
        throw new ClientSigningError(
          "signing_failed",
          cause instanceof Error
            ? cause.message
            : "Unable to sign the verification message."
        );
      }
    },
    [evmWallets, solanaWallets, signSolanaMessage]
  );

  const requireAccessToken = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new WalletVerificationFlowClientError("Authentication required.", {
        status: 401,
        code: "authentication_required",
      });
    }
    return accessToken;
  }, [getAccessToken]);

  const runSyncRetry = useCallback(async () => {
    if (!activeWalletId) return;
    setErrorMessage(null);
    setPhase("synchronizing");
    try {
      const accessToken = await requireAccessToken();
      const result = await syncVerifiedWalletInventory({
        accessToken,
        walletId: activeWalletId,
      });
      if (result.inventorySync.status === "failure") {
        setPhase("sync_failed");
        setErrorMessage(
          result.inventorySync.errorMessage ??
            "Inventory synchronization failed. Your wallet is still verified."
        );
        onIdentityRefresh();
        return;
      }
      setPhase("complete");
      onIdentityRefresh();
    } catch (cause) {
      setPhase("sync_failed");
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Inventory synchronization failed. Your wallet is still verified."
      );
      onIdentityRefresh();
    }
  }, [activeWalletId, onIdentityRefresh, requireAccessToken]);

  const startVerification = useCallback(async () => {
    if (!selectedWallet || busy) return;

    setErrorMessage(null);
    setChallengeMessage(null);
    setPhase("registering");

    try {
      const accessToken = await requireAccessToken();

      const registered = await registerWallet({
        accessToken,
        address: selectedWallet.address,
        chainNamespace: selectedWallet.chainNamespace,
        role: "connected",
      });

      setActiveWalletId(registered.wallet.walletId);

      // Already verified — skip unnecessary signing; offer sync.
      if (registered.wallet.verificationStatus === "verified") {
        setPhase("synchronizing");
        onIdentityRefresh();
        const syncResult = await syncVerifiedWalletInventory({
          accessToken,
          walletId: registered.wallet.walletId,
        });
        if (syncResult.inventorySync.status === "failure") {
          setPhase("sync_failed");
          setErrorMessage(
            syncResult.inventorySync.errorMessage ??
              "Inventory synchronization failed. Your wallet is still verified."
          );
          onIdentityRefresh();
          return;
        }
        setPhase("complete");
        onIdentityRefresh();
        return;
      }

      const challenge = await createWalletVerificationChallenge({
        accessToken,
        walletId: registered.wallet.walletId,
      });
      setChallengeMessage(challenge.message);
      setPhase("awaiting_signature");

      const signature = await signOwnershipMessage(
        selectedWallet,
        challenge.message
      );

      setPhase("verifying");
      await verifyWalletOwnership({
        accessToken,
        walletId: registered.wallet.walletId,
        challengeId: challenge.challengeId,
        signature,
        address: selectedWallet.address,
      });

      setPhase("verified");
      onIdentityRefresh();

      // Verification and inventory sync are separate outcomes.
      setPhase("synchronizing");
      const syncResult = await syncVerifiedWalletInventory({
        accessToken,
        walletId: registered.wallet.walletId,
      });

      if (syncResult.inventorySync.status === "failure") {
        setPhase("sync_failed");
        setErrorMessage(
          syncResult.inventorySync.errorMessage ??
            "Inventory synchronization failed. Your wallet is still verified."
        );
        onIdentityRefresh();
        return;
      }

      setPhase("complete");
      onIdentityRefresh();
    } catch (cause) {
      if (
        cause instanceof ClientSigningError &&
        cause.code === "user_cancelled"
      ) {
        setPhase("cancelled");
        setErrorMessage(cause.message);
        return;
      }
      if (
        cause instanceof ClientSigningError &&
        cause.code === "unsupported_capability"
      ) {
        setPhase("verification_failed");
        setErrorMessage(cause.message);
        return;
      }
      setPhase("verification_failed");
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Wallet verification failed. You can try again."
      );
    }
  }, [
    busy,
    onIdentityRefresh,
    requireAccessToken,
    selectedWallet,
    signOwnershipMessage,
  ]);

  const resetToReady = useCallback(() => {
    setPhase("ready");
    setErrorMessage(null);
    setChallengeMessage(null);
  }, []);

  return (
    <VerifyWalletFlowView
      className={className}
      phase={phase}
      connectedWallets={connectedWallets}
      selectedKey={selectedKey}
      onSelectWallet={setSelectedKey}
      onVerify={() => void startVerification()}
      onRetrySync={() => void runSyncRetry()}
      onReset={resetToReady}
      errorMessage={errorMessage}
      challengeMessage={challengeMessage}
      authenticated={authenticated}
      walletsReady={walletsReady}
    />
  );
}
