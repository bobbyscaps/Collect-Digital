"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { CollectionProfile } from "@/lib/types";

export function CollectionSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const debounce = setTimeout(async () => {
      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/collections/search?q=${encodeURIComponent(nextQuery)}`
        );
        if (!response.ok) {
          throw new Error(`Search failed with status ${response.status}`);
        }

        const data = (await response.json()) as { collections: CollectionProfile[] };
        if (latestRequestRef.current !== requestId) {
          return;
        }

        setResults(data.collections);
      } catch {
        if (latestRequestRef.current !== requestId) {
          return;
        }

        setResults([]);
        setError("Search temporarily unavailable. Please try again.");
      } finally {
        if (latestRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(debounce);
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
          placeholder="Search NFT collections..."
        />
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Searching collections...</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {!loading && !error && query.trim() && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching collections found yet.</p>
      ) : null}

      {results.length > 0 ? (
        <Card>
          <CardContent className="p-3">
            <div className="space-y-2">
              {results.map((item) => (
                <Link
                  key={item.slug}
                  href={`/collections/${item.slug}`}
                  className="flex items-center justify-between rounded-md p-2 text-sm transition hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : null}
                    {item.name}
                  </span>
                  <span className="text-muted-foreground">{item.slug}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
