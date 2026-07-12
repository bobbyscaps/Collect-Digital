"use client";

import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGatedLogin } from "./gated-login";

export function LockedCard({
  title = "Unlock the full Collect Digital evaluation",
  description,
  cta = "Log in to view full analysis",
  items,
  className,
}: {
  title?: string;
  description?: string;
  cta?: string;
  items?: string[];
  className?: string;
}) {
  const { requireLogin } = useGatedLogin();

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={requireLogin}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          requireLogin();
        }
      }}
      className={cn(
        "cursor-pointer overflow-hidden border-white/10 bg-white/[0.03] transition-colors hover:border-white/20 hover:bg-white/[0.05]",
        className
      )}
    >
      <CardContent className="p-6">
        {items && items.length > 0 && (
          <div
            aria-hidden
            className="pointer-events-none mb-5 select-none space-y-2.5 opacity-60 blur-[3px]"
          >
            {items.map((item) => (
              <div key={item} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item}</span>
                <span className="h-2 w-16 rounded-full bg-white/25" />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {description && (
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              requireLogin();
            }}
          >
            {cta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
