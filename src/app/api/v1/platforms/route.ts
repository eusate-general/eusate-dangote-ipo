import { getKnowledge } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export async function GET() {
  const { platforms, builtAt } = getKnowledge();
  const list = platforms.platforms
    .filter((p) => p.listing_status !== "not_listed")
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      listingStatus: p.listing_status,
      howtoUrl: p.howto_url ?? null,
      note: p.note?.replace(/\s+/g, " ").trim() ?? null,
    }));

  return Response.json(
    { updatedAt: builtAt, platforms: list },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
