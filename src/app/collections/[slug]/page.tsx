import Link from "next/link";

import { getCollectionEvaluation } from "@/lib/opensea/service";
import { CollectionPreview } from "@/components/collection/collection-preview";
import { UniversalSearch } from "@/components/search/universal-search";

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

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const evaluation = await getCollectionEvaluation(slug);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0%,hsl(var(--background))_72%)]" />
      </div>

      <header className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" aria-label="Collect Digital home">
          <Wordmark />
        </Link>
        <div className="w-full sm:max-w-sm">
          <UniversalSearch />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6">
        <CollectionPreview evaluation={evaluation} />
      </main>
    </div>
  );
}
