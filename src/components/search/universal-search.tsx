"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Gauge, Loader2, Search, UserCircle2 } from "lucide-react";

import type { CollectionProfile } from "@/lib/types";
import type { CollectorPreview } from "@/lib/profile/data";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "error" | "done";

type FlatItem =
  | { type: "collection"; key: string; href: string; data: CollectionProfile }
  | { type: "collector"; key: string; href: string; data: CollectorPreview };

function ResultThumb({
  src,
  fallback,
  rounded,
}: {
  src?: string | null;
  fallback: string;
  rounded: "lg" | "full";
}) {
  const [failed, setFailed] = useState(false);
  const shape = rounded === "full" ? "rounded-full" : "rounded-lg";
  const showImage = src && !failed;
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-violet-500/40 to-sky-400/40 text-xs font-semibold text-white",
        shape
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export function UniversalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [collections, setCollections] = useState<CollectionProfile[]>([]);
  const [collectors, setCollectors] = useState<CollectorPreview[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setStatus("idle");
      setCollections([]);
      setCollectors([]);
      return;
    }
    setStatus("loading");
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=6`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        setCollections(data.collections ?? []);
        setCollectors(data.collectors ?? []);
        setStatus("done");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const items = useMemo<FlatItem[]>(
    () => [
      ...collections.map((c) => ({
        type: "collection" as const,
        key: `c:${c.slug}`,
        href: `/collections/${c.slug}`,
        data: c,
      })),
      ...collectors.map((c) => ({
        type: "collector" as const,
        key: `u:${c.username}`,
        href: `/profile/${c.username}`,
        data: c,
      })),
    ],
    [collections, collectors]
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [items.length]);

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = activeIndex >= 0 ? items[activeIndex] : undefined;
      if (active) {
        go(active.href);
      } else {
        submitSearch();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="universal-search-results"
          aria-autocomplete="list"
          value={query}
          placeholder="Search collections or collectors"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-11 pr-24 text-base text-foreground shadow-sm outline-none backdrop-blur transition-colors placeholder:text-muted-foreground focus:border-white/25 focus:bg-white/[0.06]"
        />
        <button
          type="button"
          onClick={submitSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </div>

      {showDropdown && (
        <div
          id="universal-search-results"
          role="listbox"
          className="absolute z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-white/12 bg-[hsl(240_10%_6%)]/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          {status === "loading" && items.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              Something went wrong. Try again.
            </div>
          )}

          {status === "done" && items.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              No results for “{query.trim()}”.
            </div>
          )}

          {collections.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collections
              </p>
              {collections.map((collection) => {
                const index = items.findIndex((i) => i.key === `c:${collection.slug}`);
                return (
                  <button
                    key={collection.slug}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(`/collections/${collection.slug}`)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                      activeIndex === index ? "bg-white/10" : "hover:bg-white/5"
                    )}
                  >
                    <ResultThumb src={collection.imageUrl} fallback={collection.name.slice(0, 2).toUpperCase()} rounded="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{collection.name}</span>
                      <span className="block truncate text-xs capitalize text-muted-foreground">
                        {collection.chain} · Collection
                      </span>
                    </span>
                    {typeof collection.baseScore === "number" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Gauge className="h-3.5 w-3.5" />
                        {collection.baseScore}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {collectors.length > 0 && (
            <div>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collectors
              </p>
              {collectors.map((collector) => {
                const index = items.findIndex((i) => i.key === `u:${collector.username}`);
                return (
                  <button
                    key={collector.username}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(`/profile/${collector.username}`)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                      activeIndex === index ? "bg-white/10" : "hover:bg-white/5"
                    )}
                  >
                    <ResultThumb src={null} fallback={collector.initials} rounded="full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {collector.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{collector.username} · Collector
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <UserCircle2 className="h-3.5 w-3.5" />
                      {collector.collectorScore}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {items.length > 0 && (
            <button
              type="button"
              onClick={submitSearch}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-indigo-300 transition-colors hover:bg-white/5"
            >
              <Search className="h-3.5 w-3.5" />
              See all results for “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Keep a default export for convenience.
export default UniversalSearch;
