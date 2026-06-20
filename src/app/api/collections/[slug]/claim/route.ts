import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const payload = await request.json();

  return NextResponse.json({
    success: true,
    message: `Claim profile update queued for ${slug}.`,
    payload,
  });
}
