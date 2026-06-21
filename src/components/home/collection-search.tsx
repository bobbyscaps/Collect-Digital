"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { CollectionProfile } from "@/lib/types";

export function CollectionSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const latestRequestRef = useRef(0);

  async function onSearch(nextQuery: string) {
    setQuery(nextQuery);
    if (!nextQuery.trim()) {
      setResults([]);
      return;
    }

    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setLoading(true);
    const response = await fetch(`/api/collections/search?q=${encodeURIComponent(nextQuery)}`);
    const data = (await response.json()) as { collections: CollectionProfile[] };
    if (latestRequestRef.current !== requestId) {
      return;
    }
    setResults(data.collections);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          className="pl-9"
          placeholder="Search NFT collections..."
        />
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Searching collections...</p> : null}

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
