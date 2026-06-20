import { NextResponse } from "next/server";

const MEMORY_WIKI: Record<string, { title: string; content: string; createdAt: string }[]> = {};

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: RouteContext) {
  const { slug } = await params;
  return NextResponse.json({ entries: MEMORY_WIKI[slug] ?? [] });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const body = (await request.json()) as { title: string; content: string };
  const collection = MEMORY_WIKI[slug] ?? [];
  collection.unshift({
    title: body.title,
    content: body.content,
    createdAt: new Date().toISOString(),
  });
  MEMORY_WIKI[slug] = collection.slice(0, 20);

  return NextResponse.json({ success: true, entries: MEMORY_WIKI[slug] });
}
