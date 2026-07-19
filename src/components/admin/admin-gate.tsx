"use client";

import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminAllowlist, isOpenInDev } from "@/lib/admin/allowlist";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login } = usePrivy();

  if (!ready) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking access…
        </CardContent>
      </Card>
    );
  }

  const allowlist = getAdminAllowlist();
  const openInDev = allowlist.length === 0 && isOpenInDev();
  const isAdmin =
    openInDev || (authenticated && !!user && allowlist.includes(user.id));

  if (isAdmin) {
    return <>{children}</>;
  }

  if (!authenticated) {
    return (
      <Card className="border-white/10 bg-white/[0.03]">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Admin access required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Log in with an authorized account to open the Score Lab.
            </p>
          </div>
          <Button onClick={login}>Log in</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Not authorized</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            This account isn&apos;t on the admin allowlist. Ask an admin to add your
            Privy user ID below to <code>NEXT_PUBLIC_ADMIN_ALLOWLIST</code>.
          </p>
        </div>
        {user?.id && (
          <code className="max-w-full break-all rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
            {user.id}
          </code>
        )}
      </CardContent>
    </Card>
  );
}
