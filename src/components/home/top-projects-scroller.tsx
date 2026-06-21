"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface TopProjectsScrollerItem {
  slug: string;
  name: string;
  imageUrl: string;
  floorPriceEth: number;
}

interface TopProjectsScrollerProps {
  projects: TopProjectsScrollerItem[];
}

export function TopProjectsScroller({ projects }: TopProjectsScrollerProps) {
  if (!projects.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Project feed is warming up. Try collection search while live data refreshes.
      </p>
    );
  }

  const loopProjects = [...projects, ...projects];

  return (
    <div className="top-projects-track overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="top-projects-marquee flex w-max gap-3 py-1">
        {loopProjects.map((project, index) => (
          <Link
            key={`${project.slug}-${index}`}
            href={`/collections/${project.slug}`}
            className="flex min-w-64 items-center justify-between rounded-lg border bg-card/80 p-3 transition hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              {project.imageUrl ? (
                <img
                  src={project.imageUrl}
                  alt={project.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full border bg-muted" />
              )}
              <div className="space-y-0.5">
                <p className="line-clamp-1 text-sm font-semibold">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  Floor {project.floorPriceEth.toFixed(2)} ETH
                </p>
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
