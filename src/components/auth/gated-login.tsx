"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

const RETURN_TO_KEY = "cd:returnTo";

/**
 * Opens the existing Privy login modal for a gated action and remembers the
 * page the user was on so they can be returned to it after authenticating.
 * OAuth flows already return to the same URL; the stored value is a fallback.
 */
export function useGatedLogin() {
  const { ready, authenticated, login } = usePrivy();
  const pathname = usePathname();

  const requireLogin = useCallback(() => {
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, pathname);
    } catch {
      // sessionStorage may be unavailable; the OAuth redirect still returns here.
    }
    login();
  }, [login, pathname]);

  return { ready, authenticated, requireLogin };
}

export { RETURN_TO_KEY };
