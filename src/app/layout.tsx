import type { Metadata } from "next";

import "@/app/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Collect Digital",
  description:
    "NFT project intelligence with transparent scoring, wiki context, and wallet collector ratings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
