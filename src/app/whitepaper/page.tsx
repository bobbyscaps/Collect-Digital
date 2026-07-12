import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "White Paper (Draft v0.1) — Collect Digital",
  description:
    "The Collect Digital white paper: the collector intelligence network and social layer for NFT communities.",
};

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

const visionPlatforms = [
  "CoinMarketCap",
  "Wikipedia",
  "X",
  "Floor",
  "Rainbow Wallet",
  "Discord",
];

export default function WhitePaperPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_70%)]" />
      </div>

      {/* Nav */}
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Collect Digital home">
          <Wordmark />
        </Link>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/">
            <ArrowLeft />
            Back to home
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-6">
        {/* Title block */}
        <div className="mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            Draft v0.1
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Collect Digital White Paper
          </h1>
          <p className="mt-6 text-balance text-xl font-medium leading-snug sm:text-2xl">
            Blockchain technology gave us a new way to{" "}
            <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-300 bg-clip-text text-transparent">
              collect
            </span>
            .
            <br />
            Collect Digital gives us a new way to{" "}
            <span className="bg-gradient-to-r from-sky-300 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
              connect
            </span>
            .
          </p>
        </div>

        <article className="prose prose-invert max-w-none prose-headings:tracking-tight prose-h2:mt-12 prose-h2:border-t prose-h2:border-white/10 prose-h2:pt-10 prose-h3:mt-8 prose-a:text-indigo-300 prose-strong:text-foreground prose-li:marker:text-indigo-400">
          <h2>The Problem</h2>
          <p>
            NFTs changed digital ownership forever, but the collector experience
            is still fragmented.
          </p>
          <p>
            Collectors jump between OpenSea, Magic Eden, X, Discord, Telegram,
            and dozens of project websites just to research, socialize, and
            manage their collections.
          </p>
          <p>Projects are difficult to evaluate.</p>
          <p>Communities are disconnected.</p>
          <p>New collectors get rugged.</p>
          <p>There is no universal collector identity.</p>
          <p>Collect Digital changes that.</p>

          <h2>Our Mission</h2>
          <p>Build the home of digital collectors.</p>
          <p>A place where collectors can:</p>
          <ul>
            <li>Discover projects</li>
            <li>Evaluate projects</li>
            <li>Showcase collections</li>
            <li>Connect with other collectors</li>
            <li>Join token-gated communities</li>
            <li>Build reputation</li>
            <li>Earn rewards for contributing</li>
          </ul>

          <h2>Our Vision</h2>
          <p>Collect Digital is the social layer for NFT collectors.</p>
          <p>Imagine if:</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg font-medium not-prose">
            {visionPlatforms.map((platform, index) => (
              <span key={platform} className="flex items-center gap-x-3">
                <span className="text-foreground">{platform}</span>
                {index < visionPlatforms.length - 1 && (
                  <span className="text-indigo-400">×</span>
                )}
              </span>
            ))}
          </p>
          <p>were designed specifically for collectors.</p>

          <h2>Core Features</h2>

          <h3>Project Intelligence</h3>
          <p>Every NFT collection receives its own page.</p>
          <p>Projects are evaluated using:</p>
          <ul>
            <li>Holder count</li>
            <li>Floor price</li>
            <li>Liquidity</li>
            <li>Sales activity</li>
            <li>Community health</li>
            <li>Founder reputation</li>
            <li>Builder execution</li>
            <li>Revenue generation</li>
            <li>Longevity</li>
            <li>Rewards</li>
            <li>Art quality</li>
            <li>Transparency</li>
          </ul>
          <p>Scores are completely transparent and continuously improving.</p>

          <h3>Collector Profiles</h3>
          <p>Every user gets a Collector Profile.</p>
          <p>Features include:</p>
          <ul>
            <li>Showcase page</li>
            <li>Collector Score</li>
            <li>Flipper Score</li>
            <li>Badges</li>
            <li>Wallet analytics</li>
            <li>Collection gallery</li>
            <li>Social links</li>
            <li>Reputation</li>
          </ul>

          <h3>Showcase Pages</h3>
          <p>Show off your collection.</p>
          <p>Features include:</p>
          <ul>
            <li>Rotating featured NFTs</li>
            <li>Custom banner</li>
            <li>NFT comments</li>
            <li>Owner notes</li>
            <li>Collection stories</li>
          </ul>
          <p>Every NFT displayed in your gallery has its own discussion thread.</p>
          <p>Collectors can talk about the history of every piece.</p>

          <h3>Token-Gated Communities</h3>
          <p>Join communities automatically based on your wallet.</p>
          <p>Examples:</p>
          <ul>
            <li>BAYC</li>
            <li>Pudgy Penguins</li>
            <li>VeeFriends</li>
            <li>BadBad</li>
          </ul>
          <p>Each community has:</p>
          <ul>
            <li>Feed</li>
            <li>Chat</li>
            <li>Events</li>
            <li>Project page</li>
            <li>Community wiki</li>
          </ul>

          <h3>Project Wiki</h3>
          <p>Every NFT project gets its own living encyclopedia.</p>
          <p>Collectors can contribute:</p>
          <ul>
            <li>Timeline</li>
            <li>Founder history</li>
            <li>Major announcements</li>
            <li>Partnerships</li>
            <li>Roadmaps</li>
            <li>Historical events</li>
          </ul>

          <h3>Pre-Mint Evaluation</h3>
          <p>Too many collectors get rugged.</p>
          <p>Before minting, projects can be evaluated using:</p>
          <ul>
            <li>Team reputation</li>
            <li>Founder transparency</li>
            <li>Artist verification</li>
            <li>Community growth</li>
            <li>Time spent building</li>
            <li>Roadmap quality</li>
            <li>Website quality</li>
            <li>Social activity</li>
            <li>Previous projects</li>
          </ul>
          <p>The goal is to help collectors make more informed decisions.</p>

          <h3>Collect Points</h3>
          <p>
            Instead of rewarding attention, Collect Digital rewards
            contribution.
          </p>
          <p>Earn points by:</p>
          <ul>
            <li>Connecting accounts</li>
            <li>Completing your profile</li>
            <li>Posting quality content</li>
            <li>Growing communities</li>
            <li>Contributing to project pages</li>
            <li>Helping collectors</li>
            <li>Participating in discussions</li>
            <li>Funding project research</li>
          </ul>
          <p>
            A portion of platform revenue will be reinvested into community
            rewards.
          </p>

          <h3>Community Scores</h3>
          <p>Every NFT community receives a Collect Digital Score.</p>
          <p>
            Higher quality communities become more valuable places to
            participate.
          </p>
          <p>Communities earn influence by building:</p>
          <ul>
            <li>Better products</li>
            <li>Better engagement</li>
            <li>Better transparency</li>
            <li>Better collector experiences</li>
          </ul>

          <h2>Our Philosophy</h2>
          <p>Blockchain technology gave us ownership.</p>
          <p>Collect Digital brings organization.</p>
          <p>Decentralization has its upside.</p>
          <p>It&apos;s time to get organized.</p>

          <h2>Roadmap</h2>

          <h3>Phase 1</h3>
          <ul>
            <li>Authentication</li>
            <li>Wallet connection</li>
            <li>Collector profiles</li>
            <li>Showcase pages</li>
          </ul>

          <h3>Phase 2</h3>
          <ul>
            <li>Project scores</li>
            <li>Wallet analytics</li>
            <li>Collection pages</li>
            <li>Community scores</li>
          </ul>

          <h3>Phase 3</h3>
          <ul>
            <li>Token-gated communities</li>
            <li>Global collector feed</li>
            <li>NFT comments</li>
            <li>Collector messaging</li>
          </ul>

          <h3>Phase 4</h3>
          <ul>
            <li>Pre-mint evaluation</li>
            <li>Project wiki</li>
            <li>Community funding</li>
          </ul>

          <h3>Phase 5</h3>
          <ul>
            <li>Collect Points ecosystem</li>
            <li>Advanced reputation</li>
            <li>Community rewards</li>
            <li>Expanded marketplace tools</li>
          </ul>

          <h2>Our Goal</h2>
          <p>We don&apos;t want to build another marketplace.</p>
          <p>We don&apos;t want to build another wallet.</p>
          <p>We don&apos;t want to replace every social network.</p>
          <p>We want to build the home for digital collectors.</p>
        </article>

        {/* Closing block */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent p-8 text-center sm:p-10">
          <div className="flex justify-center">
            <Wordmark />
          </div>
          <div className="mt-6 space-y-2 text-lg font-semibold">
            <p>Blockchain technology gave us a new way to collect.</p>
            <p>Collect Digital gives us a new way to connect.</p>
            <p className="text-muted-foreground">
              Collect Digital wants crypto Twitter. Everyone else can stay
              there.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
