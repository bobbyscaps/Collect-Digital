import Link from "next/link";

import { getProfile } from "@/lib/profile/data";
import { ProfileProvider } from "@/components/profile/profile-context";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-400 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
        CD
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Collect<span className="text-muted-foreground"> Digital</span>
      </span>
    </div>
  );
}

export default async function ProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = getProfile(username);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_72%)]" />
      </div>

      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Collect Digital home">
          <Wordmark />
        </Link>
      </header>

      <ProfileProvider profile={profile}>
        <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <ProfileHeader />
          <ProfileTabs />
          <div className="mt-8">{children}</div>
        </main>
      </ProfileProvider>
    </div>
  );
}
