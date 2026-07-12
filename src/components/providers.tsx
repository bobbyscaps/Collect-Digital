"use client";

import { PrivyProvider } from "@privy-io/react-auth";

// Privy app IDs are public client identifiers (they ship in the browser bundle),
// so it is safe to fall back to the configured value when the env var is unset.
const PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmrhzu3qu002z0cl4rc1tf36v";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#6366f1",
          walletChainType: "ethereum-only",
        },
        loginMethods: ["wallet", "twitter", "google", "apple"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
