"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Badge } from "@/components/ui/badge";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Wallet Dashboard" },
  { href: "/admin/score-lab", label: "Score Lab" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Collect Digital
          </Link>
          <Badge variant="secondary">Methodology Visible</Badge>
        </div>

        <nav className="hidden items-center gap-4 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <ConnectButton showBalance={false} />
      </div>
    </header>
  );
}
