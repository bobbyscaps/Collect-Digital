import Link from "next/link";
import { Layers, Search as SearchIcon, Users } from "lucide-react";

import { searchCollections } from "@/lib/opensea/service";
import { searchCollectors } from "@/lib/profile/data";
import { UniversalSearch } from "@/components/search/universal-search";
import {
  CollectionResultCard,
  CollectorResultCard,
} from "@/components/search/result-cards";

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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [collections, collectors] = query
    ? await Promise.all([
        searchCollections(query).catch(() => []),
        Promise.resolve(searchCollectors(query, 12)),
      ])
    : [[], []];

  const hasResults = collections.length > 0 || collectors.length > 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_72%)]" />
      </div>

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Collect Digital home">
          <Wordmark />
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <UniversalSearch />
        </div>

        <div className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {query ? (
              <>
                Results for{" "}
                <span className="text-muted-foreground">“{query}”</span>
              </>
            ) : (
              "Search Collect Digital"
            )}
          </h1>
          {query && (
            <p className="mt-1 text-sm text-muted-foreground">
              {collections.length} collection{collections.length === 1 ? "" : "s"} ·{" "}
              {collectors.length} collector{collectors.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {!query && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
            <SearchIcon className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Search for any NFT collection or collector to get started.
            </p>
          </div>
        )}

        {query && !hasResults && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
            <SearchIcon className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No results for “{query}”. Try a different collection or collector.
            </p>
          </div>
        )}

        {collections.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-4 w-4" />
              Collections
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection) => (
                <CollectionResultCard key={collection.slug} collection={collection} />
              ))}
            </div>
          </section>
        )}

        {collectors.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-4 w-4" />
              Collectors
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collectors.map((collector) => (
                <CollectorResultCard key={collector.username} collector={collector} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
