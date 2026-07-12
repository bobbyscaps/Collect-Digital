"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Gauge,
  UserCircle2,
  ShieldCheck,
  Sparkles,
  Coins,
  Wallet,
  ArrowRight,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import {
  usePrivy,
  useLogin,
  useLoginWithOAuth,
  useConnectOrCreateWallet,
  type OAuthProviderType,
  type User,
} from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XIcon, GoogleIcon, AppleIcon } from "@/components/landing/brand-icons";
import { UniversalSearch } from "@/components/search/universal-search";
import { deriveUsername } from "@/lib/profile/data";

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const features: Feature[] = [
  {
    title: "Project Scores",
    description:
      "Transparent, versioned ratings across floor strength, liquidity, community, and founder signal.",
    icon: Gauge,
  },
  {
    title: "Collector Profiles",
    description:
      "Wallet-based identities with collector and flipper reputation you actually own.",
    icon: UserCircle2,
  },
  {
    title: "Token-Gated Communities",
    description:
      "Provable, holdings-based access to spaces built for the people who show up.",
    icon: ShieldCheck,
  },
  {
    title: "Pre-Mint Evaluation",
    description:
      "Read the signal before you commit capital, with clarity on risk and confidence.",
    icon: Sparkles,
  },
  {
    title: "Collect Points",
    description:
      "Earn reputation for contributing intelligence the whole network can trust.",
    icon: Coins,
  },
];

const socialLogins: {
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  provider: OAuthProviderType;
}[] = [
  { label: "Continue with X", icon: XIcon, provider: "twitter" },
  { label: "Continue with Google", icon: GoogleIcon, provider: "google" },
  { label: "Continue with Apple", icon: AppleIcon, provider: "apple" },
];

function accountLabel(user: User | null): string {
  if (!user) return "Account";
  if (user.twitter?.username) return `@${user.twitter.username}`;
  if (user.google?.email) return user.google.email;
  if (user.apple?.email) return user.apple.email;
  if (user.email?.address) return user.email.address;
  const address = user.wallet?.address;
  if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return "Account";
}

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

export default function LandingPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();

  // After a user logs in (and, in the future, completes onboarding), send them
  // to their Collector Profile Bio page by default.
  const goToProfile = useCallback(
    (loggedInUser: User) => {
      router.push(`/profile/${deriveUsername(loggedInUser)}`);
    },
    [router]
  );

  const { login } = useLogin({ onComplete: ({ user }) => goToProfile(user) });
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onComplete: ({ user }) => goToProfile(user),
  });
  const { connectOrCreateWallet } = useConnectOrCreateWallet({
    onSuccess: ({ wallet }) =>
      router.push(`/profile/${wallet.address.slice(2, 10).toLowerCase()}`),
  });

  const authDisabled = !ready;

  const handleOAuth = (provider: OAuthProviderType) => {
    initOAuth({ provider }).catch((error) => {
      console.error(`Privy OAuth (${provider}) failed`, error);
    });
  };

  const handleConnectWallet = () => connectOrCreateWallet();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="absolute right-[-10%] top-[20%] h-[420px] w-[420px] rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="absolute bottom-[-15%] left-[-5%] h-[420px] w-[520px] rounded-full bg-sky-500/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_78%)]" />
      </div>

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <div className="hidden items-center gap-3 sm:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <Link href="/whitepaper">White Paper</Link>
          </Button>
          {authenticated ? (
            <>
              {user && (
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link href={`/profile/${deriveUsername(user)}`}>View Profile</Link>
                </Button>
              )}
              <span className="max-w-[180px] truncate rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {accountLabel(user)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={logout}
              >
                <LogOut />
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={login}
                disabled={authDisabled}
              >
                Sign in
              </Button>
              <Button size="sm" onClick={login} disabled={authDisabled}>
                Join Collect Digital
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:gap-10 lg:py-24">
          <div className="flex flex-col items-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              The collector intelligence network
            </span>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Blockchain technology gave us a new way to{" "}
              <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300 bg-clip-text text-transparent">
                collect
              </span>
              . Collect Digital gives us a new way to{" "}
              <span className="bg-gradient-to-r from-sky-300 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                connect
              </span>
              .
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              The collector intelligence network for NFT communities, wallet
              profiles, project scores, and token-gated social discovery.
            </p>

            {/* Public universal search — no login required */}
            <div className="mt-8 w-full max-w-xl">
              <UniversalSearch />
              <p className="mt-2 text-xs text-muted-foreground">
                Search any NFT collection or collector — no account needed.
              </p>
            </div>

            <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button
                size="xl"
                className="group w-full sm:w-auto"
                onClick={login}
                disabled={authDisabled}
              >
                Join Collect Digital
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button
                size="xl"
                variant="outline"
                className="w-full border-white/15 bg-white/5 hover:bg-white/10 sm:w-auto"
                onClick={handleConnectWallet}
                disabled={authDisabled}
              >
                <Wallet />
                Connect Wallet
              </Button>
            </div>
          </div>

          {/* Login card */}
          <div className="lg:justify-self-end">
            <Card className="w-full border-white/10 bg-white/[0.03] backdrop-blur-xl lg:w-[400px]">
              <CardContent className="p-6 sm:p-8">
                <h2 className="text-lg font-semibold tracking-tight">
                  Create your collector profile
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Join the network in seconds. No setup required.
                </p>

                <div className="mt-6 space-y-3">
                  {socialLogins.map(({ label, icon: Icon, provider }) => (
                    <Button
                      key={label}
                      variant="outline"
                      className="h-11 w-full justify-center gap-3 border-white/10 bg-white/5 text-sm font-medium hover:bg-white/10"
                      onClick={() => handleOAuth(provider)}
                      disabled={authDisabled || oauthLoading}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>

                <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-white/10" />
                  or
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <Button
                  variant="outline"
                  className="h-11 w-full justify-center gap-3 border-white/15 bg-white/5 hover:bg-white/10"
                  onClick={handleConnectWallet}
                  disabled={authDisabled}
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </Button>

                <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
                  By continuing you agree to the Collect Digital Terms and
                  Privacy Policy.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Feature cards */}
        <section className="py-10 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              One network. Every collector signal.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything you need to evaluate projects, build reputation, and
              connect with communities that matter.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ title, description, icon: Icon }) => (
              <Card
                key={title}
                className="group border-white/10 bg-white/[0.03] transition-colors hover:border-white/20 hover:bg-white/[0.05]"
              >
                <CardContent className="p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-10 lg:py-16">
          <Card className="overflow-hidden border-white/10 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent">
            <CardContent className="flex flex-col items-center gap-6 p-10 text-center lg:p-14">
              <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Get on the network built for collectors.
              </h2>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  size="xl"
                  className="group w-full sm:w-auto"
                  onClick={login}
                  disabled={authDisabled}
                >
                  Join Collect Digital
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button
                  size="xl"
                  variant="outline"
                  className="w-full border-white/15 bg-white/5 hover:bg-white/10 sm:w-auto"
                  onClick={handleConnectWallet}
                  disabled={authDisabled}
                >
                  <Wallet />
                  Connect Wallet
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-center gap-4 border-t border-white/10 pt-8 sm:flex-row sm:justify-between">
          <Wordmark />
          <p className="text-center text-sm text-muted-foreground">
            Decentralization has its upside. It&apos;s time to get organized.
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Collect Digital
          </p>
        </div>
      </footer>
    </div>
  );
}
