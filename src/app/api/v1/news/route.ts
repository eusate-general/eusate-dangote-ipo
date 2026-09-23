import type { NextRequest } from "next/server";
import { getIngestStatus, getLatestNews } from "@/lib/news/store";

export const dynamic = "force-dynamic";

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

// Compact, source-carrying JSON: also the shape a future Eusate DevSpace (lab) function can call.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const limit = clampInt(params.get("limit"), 1, 20, 10);
  const days = clampInt(params.get("days"), 1, 30, 7);

  try {
    const [items, status] = await Promise.all([
      getLatestNews({ limit, days, search: q ? { kind: "web", text: q } : undefined }),
      getIngestStatus(),
    ]);
    return Response.json(
      {
        updatedAt: status.lastOkAt?.toISOString() ?? null,
        items: items.map((i) => ({
          id: i.id,
          title: i.title,
          url: i.url,
          source: i.source,
          publishedAt: i.publishedAt.toISOString(),
          summary: i.summary,
          eventTypes: i.eventTypes,
        })),
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    console.error("news api failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
